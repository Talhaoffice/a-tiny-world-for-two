import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import { get, ref } from 'firebase/database'
import { Login } from './features/auth/Login'
import { getAuthErrorMessage } from './features/auth/authErrors'
import { WorldGame } from './features/world/WorldGame'
import { Welcome } from './pages/Welcome'
import { firebaseAuth, firebaseConfigured, realtimeDatabase } from './lib/firebase'
import './lib/healthCheck'
import { logError } from './lib/logger'

export default function App() {
  const [screen, setScreen] = useState<'welcome' | 'login' | 'game'>('welcome')
  const [authorizedUid, setAuthorizedUid] = useState<string | null>(null)
  const [authMessage, setAuthMessage] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [verifyingAccess, setVerifyingAccess] = useState(false)

  useEffect(() => {
    const auth = firebaseAuth
    const database = realtimeDatabase
    if (!auth || !database) return
    let active = true
    let authEvent = 0

    const unsubscribe = onAuthStateChanged(auth, user => {
      const event = ++authEvent
      if (!user) {
        setVerifyingAccess(false)
        setAuthorizedUid(null)
        setScreen(current => current === 'game' ? 'welcome' : current)
        return
      }

      setAuthorizedUid(null)
      setVerifyingAccess(true)
      void get(ref(database, `members/${user.uid}`)).then(async member => {
        if (!active || event !== authEvent) return
        setVerifyingAccess(false)
        if (member.val() === true) {
          setAuthMessage('')
          setAuthorizedUid(user.uid)
          setScreen('game')
          return
        }

        setAuthMessage('This account is not on the island’s authorized-member list.')
        setScreen('login')
        await signOut(auth).catch(() => undefined)
      }).catch(async error => {
        if (!active || event !== authEvent) return
        logError(error, 'auth/membership-check')
        setVerifyingAccess(false)
        setAuthMessage('We could not verify island access. Check the Firebase setup and try again.')
        setScreen('login')
        await signOut(auth).catch(() => undefined)
      })
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
      {screen === 'welcome' && <Welcome onEnter={() => setScreen('login')} onExplore={() => setScreen('login')} />}
      {screen === 'login' && <Login onBack={() => setScreen('welcome')} onSubmit={handleSignIn} busy={authBusy || verifyingAccess} configured={firebaseConfigured} message={authMessage} />}
      {screen === 'game' && authorizedUid && <WorldGame uid={authorizedUid} onBack={() => { void leaveWorld() }} />}
      {screen === 'game' && !authorizedUid && <Welcome onEnter={() => setScreen('login')} onExplore={() => setScreen('login')} />}
    </div>
  )
}
