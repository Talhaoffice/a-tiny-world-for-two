import { useEffect, useState, type FormEvent } from 'react'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { addDream, deleteDream, editDream, watchDreamBoard, type DreamEntry } from './dreamBoardContent'

type Props = { uid: string; talhaUid: string; mannuUid: string; onClose: () => void }

function authorName(entry: DreamEntry, talhaUid: string, mannuUid: string) {
  if (entry.authorUid === talhaUid) return 'Talha'
  if (entry.authorUid === mannuUid) return 'Mannu'
  return 'A shared thought'
}

function dateLabel(createdAt: DreamEntry['createdAt']) {
  if (!createdAt || typeof createdAt.toDate !== 'function') return 'Just now'
  const date = createdAt.toDate()
  return Number.isNaN(date.getTime()) ? 'Just now' : date.toLocaleDateString()
}

export function DreamBoardPanel({ uid, talhaUid, mannuUid, onClose }: Props) {
  const [entries, setEntries] = useState<DreamEntry[]>([])
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDraft, setEditDraft] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => watchDreamBoard(setEntries, readError => setError(toAppError(readError).userMessage)), [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await addDream(uid, draft)
      setDraft('')
      setMessage('Your dream is on the board.')
    } catch (writeError) {
      logError(writeError, 'game/dream-create')
      setError(toAppError(writeError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  async function saveEdit(entry: DreamEntry) {
    if (busy || entry.authorUid !== uid) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await editDream(entry.id, uid, editDraft)
      setEditingId(null)
      setEditDraft('')
      setMessage('Your dream is updated.')
    } catch (writeError) {
      logError(writeError, 'game/dream-edit')
      setError(toAppError(writeError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  async function confirmDelete(entry: DreamEntry) {
    if (busy || entry.authorUid !== uid) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await deleteDream(entry.id, uid)
      setConfirmDeleteId(null)
      setMessage('Your dream is removed from the board.')
    } catch (writeError) {
      logError(writeError, 'game/dream-delete')
      setError(toAppError(writeError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dream-board-panel" role="presentation">
      <section className="world-modal-card dream-board-card" role="dialog" aria-modal="true" aria-labelledby="dream-board-title">
        <button type="button" className="world-modal-close" aria-label="Close dream board" onClick={onClose}>×</button>
        <p className="world-modal-eyebrow">A place to imagine</p>
        <h2 id="dream-board-title">Our shared dream board</h2>
        <p>Leave a plain-text thought for each other. Both of you can read every entry; only its author can edit or remove it.</p>
        <form className="dream-board-compose" onSubmit={event => { void submit(event) }}>
          <label htmlFor="dream-draft">Add a dream</label>
          <textarea id="dream-draft" value={draft} maxLength={300} rows={3} disabled={busy}
            placeholder="A small place we would like to visit…" onChange={event => setDraft(event.target.value)} />
          <div className="dream-board-compose__footer"><span>{draft.length}/300</span><button type="submit" disabled={busy || !draft.trim()}>{busy ? 'Saving…' : 'Add to board'}</button></div>
        </form>
        {(error || message) && <p className={error ? 'world-modal-message world-modal-message--error' : 'world-modal-message'} role="status">{error || message}</p>}
        <div className="dream-board-list" aria-live="polite">
          {entries.length === 0 ? <p className="dream-board-empty">The board is quiet for now.</p> : entries.map(entry => <article className="dream-card" key={entry.id}>
            <div className="dream-card__meta"><strong>{authorName(entry, talhaUid, mannuUid)}</strong><time>{dateLabel(entry.createdAt)}</time></div>
            {editingId === entry.id ? <>
              <label className="visually-hidden" htmlFor={`edit-${entry.id}`}>Edit your dream</label>
              <textarea id={`edit-${entry.id}`} value={editDraft} maxLength={300} rows={3} disabled={busy} onChange={event => setEditDraft(event.target.value)} />
              <div className="dream-card__actions"><button type="button" className="world-modal-secondary" onClick={() => { setEditingId(null); setEditDraft('') }}>Cancel</button><button type="button" disabled={busy || !editDraft.trim()} onClick={() => { void saveEdit(entry) }}>Save edit</button></div>
            </> : <>
              <p className="dream-card__text">{entry.text}</p>
              {entry.authorUid === uid && <div className="dream-card__actions">
                {confirmDeleteId === entry.id ? <>
                  <span>Remove this dream?</span>
                  <button type="button" className="world-modal-secondary" disabled={busy} onClick={() => setConfirmDeleteId(null)}>Keep it</button>
                  <button type="button" disabled={busy} onClick={() => { void confirmDelete(entry) }}>Remove</button>
                </> : <>
                  <button type="button" className="world-modal-secondary" disabled={busy} onClick={() => { setEditingId(entry.id); setEditDraft(entry.text); setConfirmDeleteId(null) }}>Edit</button>
                  <button type="button" className="dream-card__remove" disabled={busy} onClick={() => setConfirmDeleteId(entry.id)}>Remove</button>
                </>}
              </div>}
            </>}
          </article>)}
        </div>
        <div className="world-modal-actions"><button type="button" className="world-modal-secondary" onClick={onClose}>Return to the island</button></div>
      </section>
    </div>
  )
}
