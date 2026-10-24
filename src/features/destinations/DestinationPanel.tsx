import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  addKeepsake,
  addSharedNote,
  loadMembers,
  loadLetterBody,
  markLetterOpened,
  plantFlower,
  sendLetter,
  upgradeLegacyLetter,
  watchGarden,
  watchHomeContent,
  watchLetters,
  type FlowerType,
  type GardenFlower,
  type Keepsake,
  type Letter,
  type LetterBody,
  type SavedNote,
} from './content'
import type { Destination } from './types'
import { localDateTimeToDate } from './letterSchedule'
import './destinations.css'

export type { Destination } from './types'

const TITLES: Record<Destination, string> = { home: 'Our Home', garden: 'Memory Garden', mailbox: 'Mailbox' }
const FLOWERS: { type: FlowerType; label: string; glyph: string }[] = [
  { type: 'gold', label: 'Golden', glyph: '✿' },
  { type: 'rose', label: 'Rose', glyph: '✿' },
  { type: 'cream', label: 'Cream', glyph: '✿' },
  { type: 'coral', label: 'Coral', glyph: '✿' },
]

function dateLabel(date?: { toDate: () => Date }) {
  if (!date || typeof date.toDate !== 'function' || Number.isNaN(date.toDate().getTime())) return 'Just now'
  return date.toDate().toLocaleString()
}

function errorLabel(error: unknown) {
  if (error instanceof Error && /^(Add |Notes must|Letters must|Letter titles must|Only unopened|Choose a valid|That local time|The device time zone)/.test(error.message)) {
    return error.message
  }
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : ''
  if (code === 'permission-denied') return 'Firestore denied this request. Confirm this account is an active Firestore member and the published rules match this app.'
  if (code === 'failed-precondition') return 'Firestore could not run this query. Check the required Firestore index setup.'
  if (code === 'unavailable' || code === 'network-request-failed') return 'Firestore is temporarily unreachable. Check the connection and try again.'
  if (code === 'unauthenticated') return 'Your sign-in has expired. Sign in again, then retry.'
  if (code) return `Firestore request failed (${code}). Please try again.`
  return 'We could not load or save this right now. Check the Firestore setup and access rules, then try again.'
}

function letterIsOpened(letter: Letter) {
  return Boolean(letter.openedAt || letter.opened)
}

function letterIsReleased(letter: Letter) {
  return Boolean(letter.releaseAt && letter.releaseAt.toMillis() <= Date.now())
}

type Props = {
  uid: string
  active: Destination
  onClose: () => void
  onNavigate: (destination: Destination) => void
  showWelcomeOnFirstVisit: boolean
  welcomeHasBeenRead: boolean
  onWelcomeRead: () => void
  onStartTutorial: () => void
  tutorialGuide: ReactNode
}

export function DestinationPanel({ uid, active, onClose, onNavigate, showWelcomeOnFirstVisit, welcomeHasBeenRead, onWelcomeRead, onStartTutorial, tutorialGuide }: Props) {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [savePendingLong, setSavePendingLong] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [notes, setNotes] = useState<SavedNote[]>([])
  const [keepsakes, setKeepsakes] = useState<Keepsake[]>([])
  const [flowers, setFlowers] = useState<GardenFlower[]>([])
  const [letters, setLetters] = useState<Letter[]>([])
  const [letterBodies, setLetterBodies] = useState<Record<string, LetterBody>>({})
  const [members, setMembers] = useState<{ uid: string }[]>([])
  const [noteDraft, setNoteDraft] = useState('')
  const [keepsakeTitle, setKeepsakeTitle] = useState('')
  const [keepsakeDescription, setKeepsakeDescription] = useState('')
  const [flowerTitle, setFlowerTitle] = useState('')
  const [flowerMemory, setFlowerMemory] = useState('')
  const [flowerType, setFlowerType] = useState<FlowerType>('gold')
  const [letterDraft, setLetterDraft] = useState('')
  const [letterTitle, setLetterTitle] = useState('')
  const [releaseLater, setReleaseLater] = useState(false)
  const [letterReleaseAt, setLetterReleaseAt] = useState('')
  const [welcomeOpen, setWelcomeOpen] = useState(false)
  const welcomeAutoOpened = useRef(false)

  useEffect(() => {
    if (active === 'home' && showWelcomeOnFirstVisit && !welcomeAutoOpened.current) {
      welcomeAutoOpened.current = true
      setWelcomeOpen(true)
    }
  }, [active, showWelcomeOnFirstVisit])

  const dirty = useMemo(() => [noteDraft, keepsakeTitle, keepsakeDescription, flowerTitle, flowerMemory, letterTitle, letterDraft, letterReleaseAt].some(value => value.trim()) || releaseLater,
    [noteDraft, keepsakeTitle, keepsakeDescription, flowerTitle, flowerMemory, letterTitle, letterDraft, letterReleaseAt, releaseLater])

  async function refresh() {
    setLoading(true)
    setError('')
    try {
      if (active === 'home') {
        return watchHomeContent(data => {
          setNotes(data.notes)
          setKeepsakes(data.keepsakes)
          setLoading(false)
        }, reason => {
          const code = reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
            ? reason.code
            : 'unknown'
          console.error('[firestore] home content listener failed', { code, message: reason.message })
          setError(errorLabel(reason))
          setLoading(false)
        })
      } else if (active === 'garden') {
        return watchGarden(data => {
          setFlowers(data)
          setLoading(false)
        }, reason => {
          setError(errorLabel(reason))
          setLoading(false)
        })
      } else {
        const stopLetters = watchLetters(uid, data => {
          setLetters(data)
          setLoading(false)
        }, reason => {
          setError(errorLabel(reason))
          setLoading(false)
        })
        void loadMembers().then(setMembers).catch(reason => setError(errorLabel(reason)))
        return stopLetters
      }
    } catch (reason) {
      setError(errorLabel(reason))
      setLoading(false)
    }
  }

  useEffect(() => {
    let stop: (() => void) | undefined
    let mounted = true
    void Promise.resolve(refresh()).then(unsubscribe => {
      if (mounted) stop = unsubscribe
      else unsubscribe?.()
    })
    return () => {
      mounted = false
      stop?.()
    }
  }, [active, uid])

  function close() {
    if (dirty && !window.confirm('You have unsaved words here. Leave this place and discard them?')) return
    onClose()
  }

  function closeWelcome() {
    setWelcomeOpen(false)
    onWelcomeRead()
  }

  function beginTutorial() {
    onWelcomeRead()
    onStartTutorial()
  }

  async function save(operation: 'note' | 'keepsake' | 'flower' | 'letter', action: () => Promise<void>, message: string, clear: () => void) {
    console.info('[save] started', { operation })
    setBusy(true)
    setSavePendingLong(false)
    setError('')
    setSuccess('')
    const diagnosticTimer = window.setTimeout(() => {
      console.warn('[save] still pending; diagnostic threshold elapsed; operation was not cancelled', { operation })
      setSavePendingLong(true)
    }, 15000)
    try {
      await action()
      clear()
      setSuccess(message)
    } catch (reason) {
      const code = reason && typeof reason === 'object' && 'code' in reason && typeof reason.code === 'string'
        ? reason.code
        : 'unknown'
      const errorMessage = reason instanceof Error ? reason.message : 'Unknown save error.'
      console.error('[save] failed', { operation, code, message: errorMessage })
      setError(errorLabel(reason))
    } finally {
      window.clearTimeout(diagnosticTimer)
      setBusy(false)
      setSavePendingLong(false)
      console.info('[save] finished', { operation })
    }
  }

  function submit(event: FormEvent<HTMLFormElement>, operation: 'note' | 'keepsake' | 'flower' | 'letter', action: () => Promise<void>, message: string, clear: () => void) {
    event.preventDefault()
    void save(operation, action, message, clear)
  }

  async function openLetter(letter: Letter) {
    setBusy(true)
    setError('')
    try {
      const received = letter.recipientUid === uid
      if (letter.schemaVersion !== 2) {
        if (received && !letterIsOpened(letter)) await markLetterOpened(letter)
        setSuccess('Legacy letter opened.')
        return
      }
      if (received && !letterIsReleased(letter)) {
        setError(letter.releaseAt
          ? `This letter isn't ready yet. Available ${dateLabel(letter.releaseAt)}.`
          : 'This letter is not available yet.')
        return
      }

      const body = await loadLetterBody(letter.id)
      setLetterBodies(current => ({ ...current, [letter.id]: body }))
      if (received && !letterIsOpened(letter)) await markLetterOpened(letter)
      setSuccess('Letter opened.')
    } catch (reason) {
      setError(errorLabel(reason))
    } finally {
      setBusy(false)
    }
  }

  async function upgradeLetter(letter: Letter) {
    if (!window.confirm('Move this legacy letter into protected storage? It will remain available immediately.')) return
    await save('letter', () => upgradeLegacyLetter(letter), 'Legacy letter upgraded.', () => {})
  }

  const peer = members.find(member => member.uid !== uid)

  return (
    <main className="destination-page">
      <header className="destination-header">
      <button type="button" className="destination-back" onClick={close} disabled={busy}>← Back to island</button>
        <div><p className="eyebrow">A little place to share</p><h1>{TITLES[active]}</h1></div>
        <span aria-hidden="true" className="destination-sparkle">✦</span>
      </header>
      <nav className="destination-tabs" aria-label="Island destinations">
        {(Object.keys(TITLES) as Destination[]).map(destination => (
          <button key={destination} type="button" className={destination === active ? 'is-active' : ''} aria-current={destination === active ? 'page' : undefined}
            onClick={() => onNavigate(destination)} disabled={busy}>{TITLES[destination]}</button>
        ))}
      </nav>
      <section className="destination-content" aria-live="polite">
        {tutorialGuide}
        {error && <p className="destination-alert" role="alert">{error}</p>}
        {savePendingLong && <p className="destination-alert" role="status">This save is still waiting for Firestore. It may still be written, and the timeout did not cancel it. Don’t submit again; wait for a success or failure message.</p>}
        {success && <p className="destination-success" role="status">{success}</p>}
        {loading ? <p className="destination-empty">Opening this little place…</p> : active === 'home' ? <>
          <section className={`welcome-letter${welcomeOpen ? ' welcome-letter--open' : ''}`} aria-labelledby="welcome-letter-title">
            <p className="welcome-letter__eyebrow">A letter left in the cottage</p>
            <h2 id="welcome-letter-title">Welcome to your little island</h2>
            {welcomeOpen ? <>
              <p>We made this quiet place for the two of you. Leave a note for an ordinary day, tuck away a keepsake, plant a memory in the garden, or send a letter when you want a little more space for your words.</p>
              <p>There’s no rush here. Wander together and make the island feel like yours.</p>
              <div className="welcome-letter__actions">
                <button type="button" onClick={beginTutorial}>Begin the guided tour</button>
                <button type="button" className="welcome-letter__secondary" onClick={closeWelcome}>Close letter</button>
              </div>
            </> : <button type="button" className="welcome-letter__reopen" onClick={() => setWelcomeOpen(true)}>
              {welcomeHasBeenRead ? 'Open the welcome letter again' : 'Open your welcome letter'}
            </button>}
          </section>
          <div className="destination-columns">
            <section className="destination-card">
              <h2>Shared notes</h2>
              <form onSubmit={event => submit(event, 'note', () => addSharedNote(uid, noteDraft), 'Note saved for both of you.', () => setNoteDraft(''))}>
                <label htmlFor="shared-note">Leave a note</label><textarea id="shared-note" maxLength={500} value={noteDraft} onChange={event => setNoteDraft(event.target.value)} placeholder="A little thought to keep…" disabled={busy} />
                <div className="form-footer"><small>{noteDraft.length}/500</small><button disabled={busy || !noteDraft.trim()}>Save note</button></div>
              </form>
              <div className="saved-list">{notes.length ? notes.map(note => <article className="saved-item" key={note.id}><p>{note.text}</p><small>{note.authorUid === uid ? 'You' : 'Your person'} · {dateLabel(note.createdAt)}</small>{note.hasPendingWrites && <small className="save-pending">Not saved to the server yet</small>}</article>) : <p className="destination-empty">No notes yet. Leave the first one.</p>}</div>
            </section>
            <section className="destination-card">
              <h2>Keepsakes</h2>
              <form onSubmit={event => submit(event, 'keepsake', () => addKeepsake(uid, keepsakeTitle, keepsakeDescription), 'Keepsake tucked away.', () => { setKeepsakeTitle(''); setKeepsakeDescription('') })}>
                <label htmlFor="keepsake-title">Short title</label><input id="keepsake-title" maxLength={60} value={keepsakeTitle} onChange={event => setKeepsakeTitle(event.target.value)} placeholder="A small thing to remember" disabled={busy} />
                <label htmlFor="keepsake-description">Description</label><textarea id="keepsake-description" maxLength={300} value={keepsakeDescription} onChange={event => setKeepsakeDescription(event.target.value)} placeholder="Add a few details…" disabled={busy} />
                <div className="form-footer"><small>{keepsakeDescription.length}/300</small><button disabled={busy || !keepsakeTitle.trim() || !keepsakeDescription.trim()}>Keep this</button></div>
              </form>
              <div className="saved-list">{keepsakes.length ? keepsakes.map(item => <article className="saved-item" key={item.id}><h3>{item.title}</h3><p>{item.description}</p><small>{item.authorUid === uid ? 'You' : 'Your person'} · {dateLabel(item.createdAt)}</small>{item.hasPendingWrites && <small className="save-pending">Not saved to the server yet</small>}</article>) : <p className="destination-empty">Nothing tucked away yet.</p>}</div>
            </section>
          </div>
        </> : active === 'garden' ? <>
          <section className="destination-card garden-card">
            <h2>Plant a shared memory</h2>
          <form className="garden-form" onSubmit={event => submit(event, 'flower', () => plantFlower(uid, flowerTitle, flowerMemory, flowerType), 'A new memory is growing.', () => { setFlowerTitle(''); setFlowerMemory('') })}>
              <label htmlFor="flower-title">Flower title</label><input id="flower-title" maxLength={60} value={flowerTitle} onChange={event => setFlowerTitle(event.target.value)} placeholder="A name for this memory" disabled={busy} />
              <label htmlFor="flower-memory">Memory</label><textarea id="flower-memory" maxLength={300} value={flowerMemory} onChange={event => setFlowerMemory(event.target.value)} placeholder="Write a few words you want to remember…" disabled={busy} />
              <label htmlFor="flower-type">Choose a flower</label><select id="flower-type" value={flowerType} onChange={event => setFlowerType(event.target.value as FlowerType)} disabled={busy}>{FLOWERS.map(flower => <option key={flower.type} value={flower.type}>{flower.label}</option>)}</select>
              <div className="form-footer"><small>{flowerMemory.length}/300</small><button disabled={busy || !flowerTitle.trim() || !flowerMemory.trim()}>Plant flower</button></div>
            </form>
          </section>
          <section className="flower-garden" aria-label="Saved memories">
            {flowers.length ? flowers.map(flower => <article key={flower.id} className={`memory-flower flower-${flower.flowerType}`}><span aria-hidden="true">✿</span><h3>{flower.title}</h3><p>{flower.memory}</p><small>{flower.authorUid === uid ? 'You planted this' : 'Your person planted this'} · {dateLabel(flower.createdAt)}</small></article>) : <p className="destination-empty">The garden is waiting for its first flower.</p>}
          </section>
        </> : <>
          <div className="destination-columns mailbox-columns">
            <section className="destination-card">
              <h2>Write a letter</h2>
          {peer ? <form onSubmit={event => submit(event, 'letter', () => sendLetter(
            uid,
            peer.uid,
            letterTitle,
            letterDraft,
            releaseLater ? localDateTimeToDate(letterReleaseAt) : null,
          ), releaseLater ? 'Your letter has been scheduled.' : 'Your letter has been sent.', () => {
            setLetterTitle('')
            setLetterDraft('')
            setLetterReleaseAt('')
            setReleaseLater(false)
          })}>
                <p className="mailbox-recipient">To your person</p>
                <label htmlFor="letter-title">Letter title</label><input id="letter-title" maxLength={80} value={letterTitle} onChange={event => setLetterTitle(event.target.value)} placeholder="Add a short title" disabled={busy} required />
                <label htmlFor="letter-text">Your letter</label><textarea id="letter-text" maxLength={2000} value={letterDraft} onChange={event => setLetterDraft(event.target.value)} placeholder="Write something for them to read…" disabled={busy} required />
                <label className="letter-schedule-toggle"><input type="checkbox" checked={releaseLater} onChange={event => setReleaseLater(event.target.checked)} disabled={busy} />Schedule for later</label>
                {releaseLater && <>
                  <label htmlFor="letter-release-at">Release date and time (your local time)</label>
                  <input id="letter-release-at" type="datetime-local" value={letterReleaseAt} onChange={event => setLetterReleaseAt(event.target.value)} disabled={busy} required />
                  <small className="letter-time-help">The release time is stored in UTC and shown in each viewer’s local time.</small>
                </>}
                <div className="form-footer"><small>{letterDraft.length}/2000</small><button disabled={busy || !letterTitle.trim() || !letterDraft.trim() || (releaseLater && !letterReleaseAt)}>{releaseLater ? 'Schedule letter' : 'Send letter'}</button></div>
              </form> : <p className="destination-empty">Mailbox setup needs exactly two active Firestore member records. Ask the project owner to complete the setup guide.</p>}
            </section>
            <section className="destination-card">
              <h2>Your letters</h2>
              <div className="saved-list">{letters.length ? letters.map(letter => {
                const received = letter.recipientUid === uid
                const legacy = letter.schemaVersion !== 2
                const opened = letterIsOpened(letter)
                const body = letterBodies[letter.id]
                return <article className="saved-item letter-item" key={letter.id}>
                  <small>{received ? 'From your person' : 'To your person'} · {dateLabel(letter.createdAt)}</small>
                  {legacy ? <>
                    <p>{letter.text}</p>
                    {received && !opened ? <button type="button" disabled={busy} onClick={() => { void openLetter(letter) }}>Mark as opened</button> : received ? <small className="opened-label">Opened</small> : <small>Sent · legacy format</small>}
                    {!received && !opened && letter.text && <button type="button" disabled={busy} onClick={() => { void upgradeLetter(letter) }}>Upgrade to protected format</button>}
                  </> : <>
                    {body && <><h3>{body.title}</h3><p>{body.text}</p></>}
                    {received && !letterIsReleased(letter)
                      ? <p>This letter isn't ready yet. Available {dateLabel(letter.releaseAt)}.</p>
                      : <button type="button" disabled={busy} onClick={() => { void openLetter(letter) }}>{received && !opened ? 'Open letter' : 'Read letter'}</button>}
                    {received && opened && <small className="opened-label">Opened</small>}
                    {!received && <small>Sent</small>}
                  </>}
                </article>
              }) : <p className="destination-empty">No letters yet. There is room for one when you’re ready.</p>}</div>
            </section>
          </div>
        </>}
      </section>
    </main>
  )
}
