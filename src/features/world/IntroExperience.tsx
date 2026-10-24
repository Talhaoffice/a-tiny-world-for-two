import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { completeIntroOnce, INTRO_LETTER_LIMIT, INTRO_LETTER_PLACEHOLDER, loadIntroLetter, saveIntroLetter } from './introContent'
import { continueIntroFlow, type IntroMode } from './introFlow'
import './intro.css'

type Props = {
  uid: string
  talhaUid: string
  mode: IntroMode
  onClose: () => void
  onComplete: () => void
}

export function IntroExperience({ uid, talhaUid, mode, onClose, onComplete }: Props) {
  const [letter, setLetter] = useState(INTRO_LETTER_PLACEHOLDER)
  const [initialText, setInitialText] = useState(INTRO_LETTER_PLACEHOLDER)
  const [letterExists, setLetterExists] = useState(false)
  const [opened, setOpened] = useState(mode === 'edit')
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setMessage('')
    void loadIntroLetter().then(result => {
      if (!active) return
      setLetter(result.text)
      setInitialText(result.text)
      setLetterExists(result.exists)
      setLoading(false)
    }).catch(error => {
      logError(error, 'firestore/intro-letter-read')
      if (!active) return
      setMessage(toAppError(error, 'The letter could not be loaded. Check your connection and try again.').userMessage)
      setLoading(false)
    })
    return () => { active = false }
  }, [uid, mode])

  const changed = letter !== initialText

  function close() {
    if (mode === 'edit' && changed && !window.confirm('Discard your unsaved changes to the first-entry letter?')) return
    onClose()
  }

  async function continueFromLetter() {
    if (pending) return
    setPending(true)
    setMessage('')
    try {
      const firstEntry = await continueIntroFlow(mode, () => completeIntroOnce(uid))
      if (firstEntry) onComplete()
      else onClose()
    } catch (error) {
      logError(error, 'firestore/intro-complete')
      setMessage(toAppError(error).userMessage)
    } finally {
      setPending(false)
    }
  }

  async function save() {
    if (pending || !changed || uid !== talhaUid) return
    const normalized = letter.trim()
    if (!normalized || normalized.length > INTRO_LETTER_LIMIT) {
      setMessage('The first-entry letter must be between 1 and 2,000 characters.')
      return
    }
    if (letterExists && !window.confirm('Replace the current first-entry letter with these changes?')) return
    setPending(true)
    setMessage('')
    try {
      await saveIntroLetter(uid, talhaUid, normalized)
      setLetter(normalized)
      setInitialText(normalized)
      setLetterExists(true)
      setMessage('Letter saved.')
    } catch (error) {
      logError(error, 'firestore/intro-letter-save')
      setMessage(toAppError(error, 'The letter could not be saved. Check your connection and try again.').userMessage)
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <div className="intro-room" aria-hidden="true">
        <div className="intro-room__window"><span /><span /><span /><span /></div>
        <div className="intro-room__shelf"><i /><i /><i /><i /></div>
        <div className="intro-room__plant">✦</div>
        <div className="intro-room__lamp"><i /></div>
        <div className="intro-room__rug" />
      </div>
      <div className="intro-card">
        <div className="intro-card__topline">
          <p className="eyebrow">A little place to come home to</p>
          {mode !== 'first-entry' && <button className="intro-close" type="button" onClick={close} aria-label="Close letter">×</button>}
        </div>
        <h1 id="intro-title">{mode === 'edit' ? 'Write the first-entry letter' : 'A letter for you'}</h1>

        {mode === 'edit' ? (
          <div className="intro-editor">
            <p>Only Talha can save this letter. It will appear here for Mannu on first entry.</p>
            <label htmlFor="intro-letter-text">Letter text</label>
            <textarea
              id="intro-letter-text"
              value={letter}
              maxLength={INTRO_LETTER_LIMIT}
              onChange={event => setLetter(event.target.value)}
              disabled={loading || pending || uid !== talhaUid}
              rows={8}
            />
            <div className="intro-editor__meta"><span>{letter.length}/{INTRO_LETTER_LIMIT}</span><span>{letterExists ? 'Saved letter' : 'No saved letter yet'}</span></div>
            {message && <p className="intro-message" role="status">{message}</p>}
            <div className="intro-actions">
              <Button variant="quiet" onClick={close} disabled={pending}>Close</Button>
              <Button onClick={() => { void save() }} disabled={loading || pending || !changed || uid !== talhaUid}>{pending ? 'Saving…' : 'Save letter'}</Button>
            </div>
          </div>
        ) : (
          <>
            <div className={`intro-envelope${opened ? ' intro-envelope--opened' : ''}`}>
              <div className="intro-envelope__back" />
              <div className="intro-envelope__letter" aria-hidden="true"><span /><span /><span /></div>
              <div className="intro-envelope__front" />
              <div className="intro-envelope__seal" aria-hidden="true">♡</div>
            </div>
            {!opened ? (
              <div className="intro-open-prompt">
                <p>{mode === 'first-entry' ? 'There is a letter waiting for you.' : 'The envelope is still here whenever you want to read it.'}</p>
                <Button onClick={() => setOpened(true)} disabled={loading}>{loading ? 'Loading letter…' : 'Open the envelope'}</Button>
              </div>
            ) : (
              <div className="intro-letter">
                {loading ? <p>Opening the letter…</p> : <p className={letter === INTRO_LETTER_PLACEHOLDER ? 'intro-letter__placeholder' : undefined}>{letter}</p>}
              </div>
            )}
            {message && <p className="intro-message" role="status">{message}</p>}
            {opened && <div className="intro-actions">
              {mode !== 'first-entry' && <Button variant="quiet" onClick={close} disabled={pending}>Back to island</Button>}
              <Button onClick={() => { void continueFromLetter() }} disabled={loading || pending}>{pending ? 'One moment…' : 'Chalo, hamari duniya dekhte hain ♡'}</Button>
            </div>}
          </>
        )}
      </div>
      <div className="intro-room__floor" aria-hidden="true" />
    </section>
  )
}
