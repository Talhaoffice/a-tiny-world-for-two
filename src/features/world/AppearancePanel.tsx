import { useState } from 'react'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { saveCharacterAppearance } from './characterRoster'
import { isCharacterAppearance, type CharacterAppearance } from './characters.config'

type Props = {
  uid: string
  appearance: CharacterAppearance
  onClose: () => void
  onSaved: (appearance: CharacterAppearance) => void
}

export function AppearancePanel({ uid, appearance, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<CharacterAppearance>(appearance)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    if (busy) return
    if (!isCharacterAppearance(draft)) {
      setMessage('Choose a valid combination before saving.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      await saveCharacterAppearance(uid, draft)
      onSaved(draft)
      setMessage('Your look is saved.')
    } catch (error) {
      logError(error, 'game/appearance-save')
      setMessage(toAppError(error).userMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="appearance-panel" role="presentation">
      <section className="world-modal-card" role="dialog" aria-modal="true" aria-labelledby="appearance-title">
        <button type="button" className="world-modal-close" aria-label="Close wardrobe" onClick={onClose}>×</button>
        <p className="world-modal-eyebrow">A little change</p>
        <h2 id="appearance-title">Choose a look</h2>
        <p>Pick any hair, outfit, and accessory for your island character.</p>
        <label htmlFor="appearance-hair">Hair</label>
        <select id="appearance-hair" value={draft.hair} onChange={event => setDraft(value => ({ ...value, hair: event.target.value as CharacterAppearance['hair'] }))}>
          <option value="short">Short</option><option value="long">Long</option>
        </select>
        <label htmlFor="appearance-outfit">Outfit</label>
        <select id="appearance-outfit" value={draft.outfit} onChange={event => setDraft(value => ({ ...value, outfit: event.target.value as CharacterAppearance['outfit'] }))}>
          <option value="jacket">Jacket</option><option value="cardigan">Cardigan</option><option value="dress">Dress</option>
        </select>
        <label htmlFor="appearance-accessory">Accessory</label>
        <select id="appearance-accessory" value={draft.accessory} onChange={event => setDraft(value => ({ ...value, accessory: event.target.value as CharacterAppearance['accessory'] }))}>
          <option value="none">None</option><option value="lantern-clip">Lantern clip</option><option value="sage-accent">Sage accent</option>
        </select>
        {message && <p className="world-modal-message" role="status">{message}</p>}
        <div className="world-modal-actions">
          <button type="button" className="world-modal-secondary" onClick={onClose}>Close</button>
          <button type="button" disabled={busy} onClick={() => { void save() }}>{busy ? 'Saving…' : 'Save look'}</button>
        </div>
      </section>
    </div>
  )
}
