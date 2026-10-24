import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { WorldScene } from '../../components/WorldScene'

type Props = {
  onBack: () => void
  onSubmit: (email: string, password: string) => Promise<void>
  busy: boolean
  configured: boolean
  message: string
}

export function Login({ onBack, onSubmit, busy, configured, message }: Props) {
  const [visible, setVisible] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit(email.trim(), password)
  }

  return (
    <main className="page login-page">
      <button className="back-button" onClick={onBack}><span aria-hidden="true">←</span> Back</button>
      <div className="login-layout">
        <div className="login-art"><WorldScene /></div>
        <section className="login-card" aria-labelledby="login-title">
          <p className="eyebrow">The little world is waiting</p>
          <h1 id="login-title">Come on in</h1>
          <p className="login-intro">This world is for Talha and Mannu.</p>
          <form onSubmit={event => { void handleSubmit(event) }}>
            <label htmlFor="email">Email address</label>
            <input id="email" name="email" type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="Your invited email" required disabled={busy} />
            <label htmlFor="password">Password</label>
            <div className="password-field">
              <input id="password" name="password" type={visible ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" required disabled={busy} />
              <button type="button" className="show-password" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(v => !v)}>{visible ? 'Hide' : 'Show'}</button>
            </div>
            <Button type="submit" className="login-submit" disabled={!configured || busy}>{busy ? 'Checking access…' : 'Enter our world'} <span aria-hidden="true">→</span></Button>
          </form>
          <p className={`auth-note ${message ? 'auth-note--active' : ''}`} role="status">{message || (configured ? 'Use one of the two invited accounts.' : 'Firebase is not configured yet. Follow FIREBASE_SETUP.md to connect this app.')}</p>
        </section>
      </div>
      <footer className="footer">Made with love by Talha <span aria-hidden="true">✦</span></footer>
    </main>
  )
}
