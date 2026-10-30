import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { Login } from './features/auth/Login'
import { getAuthErrorMessage } from './features/auth/authErrors'
import { WorldGame } from './features/world/WorldGame'
import { Welcome } from './pages/Welcome'
import { firebaseAuth, firebaseConfigured, realtimeDatabase } from './lib/firebase'
import './lib/healthCheck'
import { logError, recordBootStep } from './lib/logger'
import { BootTracePanel } from './components/BootTracePanel'
import { CopyDiagnosticsButton } from './components/CopyDiagnosticsButton'
import { membershipDenialMessage, retryMembershipRead, startupProgress } from './lib/startupProgress'
import type { StartupProgressState } from './lib/startupProgress'

export default function App() {
  const [screen, setScreen] = useState<'welcome' | 'login' | 'game'>('welcome')
  const [authorizedUid, setAuthorizedUid] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [verifyingAccess, setVerifyingAccess] = useState(false)
  const [startupState, setStartupState] = useState<StartupProgressState>(() => startupProgress.getSnapshot())

  useEffect(() => startupProgress.subscribe(setStartupState), [])

  useEffect(() => {
    recordBootStep('auth', 'started')
    const auth = firebaseAuth
    const database = realtimeDatabase
    if (!auth || !database) {
      const error = Object.assign(new Error('Firebase is not configured.'), { code: 'unavailable' })
      recordBootStep('auth', 'failed', error)
      startupProgress.fail('auth', 'Sign-in could not start. Check the connection and retry.')
      return
    }
    let active = true
    let authEvent = 0

    const unsubscribe = onAuthStateChanged(auth, user => {
      const event = ++authEvent
      if (!user) {
        recordBootStep('auth', 'done')
        if (startupProgress.getSnapshot().status !== 'failed') startupProgress.ready()
        setVerifyingAccess(false)
        setAuthorizedUid(null)
        setScreen(current => current === 'game' ? 'welcome' : current)
        return
      }

      startupProgress.begin('auth')
      recordBootStep('auth', 'started')
      recordBootStep('auth', 'done')
      setAuthorizedUid(null)
      setVerifyingAccess(true)
      void retryMembershipRead(
        () => get(ref(database, `members/${user.uid}`)),
        () => recordBootStep('membership', 'started'),
        (error) => {
          logError(error, 'auth/membership-check')
          recordBootStep('membership', 'failed', error)
        },
        undefined,
        () => active && event === authEvent,
      ).then(async member => {
        if (!active || event !== authEvent) return
        setVerifyingAccess(false)
        if (member.val() === true) {
          recordBootStep('membership', 'done')
          setAuthMessage('')
          setAuthorizedUid(user.uid)
          setScreen('game')
          return
        }

        const denial = Object.assign(new Error(membershipDenialMessage()), { code: 'permission-denied' })
        recordBootStep('membership', 'failed', denial)
        startupProgress.fail('membership', membershipDenialMessage())
        setAuthMessage(membershipDenialMessage())
        setScreen('login')
        await signOut(auth).catch(() => undefined)
      }).catch(async () => {
        if (!active || event !== authEvent) return
        setVerifyingAccess(false)
        startupProgress.fail('membership', 'Could not verify island access after four attempts. Retry when the connection is available.')
        setAuthMessage('We could not verify island access. Check the connection and retry.')
        setScreen('login')
      })
    }, error => {
      if (!active) return
      logError(error, 'auth/state')
      recordBootStep('auth', 'failed', error)
      startupProgress.fail('auth', 'Sign-in could not be checked. Retry when the connection is available.')
      setVerifyingAccess(false)
      setAuthMessage('We could not check your sign-in. Try again.')
      setScreen('login')
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  async function handleSignIn(email: string, password: string) {
    const auth = firebaseAuth
    if (!auth) {
      setAuthMessage('Firebase is not configured. Follow FIREBASE_SETUP.md to connect this app.')
      return
    }

    setAuthBusy(true)
    setAuthMessage('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      logError(error, 'auth/sign-in')
      setAuthMessage(getAuthErrorMessage(error))
    } finally {
      setAuthBusy(false)
    }
  }

  async function leaveWorld() {
    setScreen('welcome')
    if (firebaseAuth) await signOut(firebaseAuth).catch(() => undefined)
  }

  return (
    <div key={screen} className="screen-transition">
      <BootTracePanel />
      {verifyingAccess && startupState.status === 'connecting' && <div className="app-startup-progress" role="status" aria-live="polite">
        <span className="startup-spinner" aria-hidden="true" />
        <span>Still connecting… Checking island access.</span>
      </div>}
      {startupState.status === 'failed' && screen !== 'game' && <section className="app-error" role="alert">
        <p className="eyebrow">A small pause</p>
        <h1>The island could not load</h1>
        <p>{startupState.message} Stuck at: {startupState.step}.</p>
        <div className="app-error__actions">
          <button type="button" onClick={() => window.location.reload()}>Retry</button>
          <CopyDiagnosticsButton />
        </div>
      </section>}
      {screen === 'welcome' && <Welcome onEnter={() => setScreen('login')} onExplore={() => setScreen('login')} />}
      {screen === 'login' && <Login onBack={() => setScreen('welcome')} onSubmit={handleSignIn} busy={authBusy || verifyingAccess} configured={firebaseConfigured} message={authMessage} />}
      {screen === 'game' && authorizedUid && <WorldGame uid={authorizedUid} onBack={() => { void leaveWorld() }} />}
      {screen === 'game' && !authorizedUid && <Welcome onEnter={() => setScreen('login')} onExplore={() => setScreen('login')} />}
    </div>
  )
}
