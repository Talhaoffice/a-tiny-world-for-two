import { useEffect, useState } from 'react'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { isValidAnnualDate, type AnnualSpecialDates } from './annualSpecialDates'
import { saveAnnualSpecialDates, watchAnnualSpecialDates } from './specialDatesContent'

type Props = {
  uid: string
  talhaUid: string
  initialDates: AnnualSpecialDates
  onClose: () => void
  onDatesChange: (dates: AnnualSpecialDates) => void
}

const FIELDS: Array<keyof AnnualSpecialDates> = ['dateOne', 'dateTwo', 'dateThree', 'dateFour', 'dateFive']

export function SpecialDatesPanel({ uid, talhaUid, initialDates, onClose, onDatesChange }: Props) {
  const [draft, setDraft] = useState<AnnualSpecialDates>(initialDates)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const owner = uid === talhaUid

  useEffect(() => watchAnnualSpecialDates(dates => {
    setDraft(dates)
    onDatesChange(dates)
  }, readError => setError(toAppError(readError).userMessage)), [onDatesChange])

  function updateDate(field: keyof AnnualSpecialDates, value: string) {
    const date = value.trim() || null
    const next = { ...draft, [field]: date }
    setDraft(next)
    setError('')
    setMessage('')
  }

  async function save() {
    if (!owner || busy) return
    const values = FIELDS.map(field => draft[field]).filter((value): value is string => Boolean(value))
    if (values.some(value => !isValidAnnualDate(value)) || new Set(values).size !== values.length) {
      setError('Use five or fewer different, valid month-and-day values, such as 06-15.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveAnnualSpecialDates(uid, talhaUid, draft)
      onDatesChange(draft)
      setMessage('The special dates are saved.')
    } catch (saveError) {
      logError(saveError, 'game/special-dates-save')
      setError(toAppError(saveError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="special-dates-panel" role="presentation">
      <section className="world-modal-card" role="dialog" aria-modal="true" aria-labelledby="special-dates-title">
        <button type="button" className="world-modal-close" aria-label="Close special dates" onClick={onClose}>×</button>
        <p className="world-modal-eyebrow">Gentle little reminders</p>
        <h2 id="special-dates-title">Our special dates</h2>
        <p>Only month and day are shared. On the day itself, the island gets a soft extra glow—there is no countdown.</p>
        {FIELDS.map((field, index) => <label className="special-date-field" key={field} htmlFor={field}>
          <span>Special date {index + 1}</span>
          <input id={field} type="text" inputMode="numeric" autoComplete="off" maxLength={5}
            pattern="(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])" placeholder="MM-DD"
            aria-label={`Special date ${index + 1}, month and day`} disabled={!owner || busy}
            value={draft[field] ?? ''} onChange={event => updateDate(field, event.target.value)} />
        </label>)}
        {!owner && <p className="corner-owner-note">Talha manages these dates. Both of you can see the gentle same-day effect.</p>}
        {(error || message) && <p className={error ? 'world-modal-message world-modal-message--error' : 'world-modal-message'} role="status">{error || message}</p>}
        <div className="world-modal-actions">
          <button type="button" className="world-modal-secondary" onClick={onClose}>Close</button>
          {owner && <button type="button" disabled={busy} onClick={() => { void save() }}>{busy ? 'Saving…' : 'Save dates'}</button>}
        </div>
      </section>
    </div>
  )
}
