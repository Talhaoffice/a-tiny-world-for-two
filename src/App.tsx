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

export default function App() {
  const [screen, setScreen] = useState<'welcome' | 'login' | 'game'>('welcome')
  const [authorizedUid, setAuthorizedUid] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [verifyingAccess, setVerifyingAccess] = useState(false)
  const [authStatePending, setAuthStatePending] = useState(true)
  const [startupWaitFailed, setStartupWaitFailed] = useState(false)

  useEffect(() => {
    if (!authStatePending && !verifyingAccess) {
      setStartupWaitFailed(false)
      return
    }
    const timeout = window.setTimeout(() => {
      const error = Object.assign(new Error('Sign-in or membership check timed out.'), { code: 'deadline-exceeded' })
      logError(error, 'app/startup-timeout')
      recordBootStep(authStatePending ? 'auth' : 'membership', 'failed', error)
      setStartupWaitFailed(true)
    }, 10_000)
    return () => window.clearTimeout(timeout)
  }, [authStatePending, verifyingAccess])

  useEffect(() => {
    recordBootStep('auth', 'started')
    const auth = firebaseAuth
    const database = realtimeDatabase
    if (!auth || !database) {
      recordBootStep('auth', 'failed', Object.assign(new Error('Firebase is not configured.'), { code: 'unavailable' }))
      setAuthStatePending(false)
      return
    }
    let active = true
    let authEvent = 0

    const unsubscribe = onAuthStateChanged(auth, user => {
      const event = ++authEvent
      setAuthStatePending(false)
      recordBootStep('auth', 'done')
      if (!user) {
        setVerifyingAccess(false)
        setAuthorizedUid(null)
        setScreen(current => current === 'game' ? 'welcome' : current)
        return
      }

      setAuthorizedUid(null)
      setVerifyingAccess(true)
      recordBootStep('membership', 'started')
      void get(ref(database, `members/${user.uid}`)).then(async member => {
        if (!active || event !== authEvent) return
        setVerifyingAccess(false)
        if (member.val() === true) {
          recordBootStep('membership', 'done')
          setAuthMessage('')
          setAuthorizedUid(user.uid)
          setScreen('game')
          return
        }

        recordBootStep('membership', 'failed', Object.assign(new Error('Island membership was denied.'), { code: 'permission-denied' }))
        setAuthMessage('This account is not on the island’s authorized-member list.')
        setScreen('login')
        await signOut(auth).catch(() => undefined)
      }).catch(async error => {
        if (!active || event !== authEvent) return
        logError(error, 'auth/membership-check')
        recordBootStep('membership', 'failed', error)
        setVerifyingAccess(false)
        setAuthMessage('We could not verify island access. Check the Firebase setup and try again.')
        setScreen('login')
        await signOut(auth).catch(() => undefined)
      })
    }, error => {
      if (!active) return
      setAuthStatePending(false)
      logError(error, 'auth/state')
      recordBootStep('auth', 'failed', error)
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
      {startupWaitFailed && <section className="app-error" role="alert">
        <p className="eyebrow">A small pause</p>
        <h1>The island could not load</h1>
        <p>Sign-in or island access is taking longer than expected. Retry or copy diagnostics.</p>
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
