import { constellationForDate } from './constellation'
import type { AnnualSpecialDates } from './annualSpecialDates'

type Props = {
  dates: AnnualSpecialDates
  selectedDates: string[]
  onSelectedDatesChange: (dates: string[]) => void
  onClose: () => void
}

const DATE_FIELDS: Array<keyof AnnualSpecialDates> = ['dateOne', 'dateTwo', 'dateThree', 'dateFour', 'dateFive']

export function StargazingPanel({ dates, selectedDates, onSelectedDatesChange, onClose }: Props) {
  const availableDates = DATE_FIELDS.map((field, index) => ({ slot: index, date: dates[field] })).filter(
    (value): value is { slot: number; date: string } => typeof value.date === 'string',
  )
  const constellations = selectedDates.map((date, slot) => ({ date, points: constellationForDate(date, slot) })).filter(item => item.points.length > 0)

  function toggleDate(date: string, selected: boolean) {
    onSelectedDatesChange(selected
      ? [...new Set([...selectedDates, date])]
      : selectedDates.filter(value => value !== date))
  }

  return (
    <div className="stargazing-panel" role="presentation">
      <section className="world-modal-card stargazing-card" role="dialog" aria-modal="true" aria-labelledby="stargazing-title">
        <button type="button" className="world-modal-close" aria-label="Close stargazing spot" onClick={onClose}>×</button>
        <p className="world-modal-eyebrow">Look up together</p>
        <h2 id="stargazing-title">Our little sky</h2>
        <p>Choose a few saved month-and-day memories to trace as tiny constellations. These stars are a quiet, optional decoration.</p>
        <div className="star-map-preview" role="img" aria-label={constellations.length ? `${constellations.length} optional memory constellations` : 'No memory constellations selected'}>
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            {constellations.map((item, index) => <g key={`${item.date}-${index}`} className={`star-map-preview__shape star-map-preview__shape--${index % 5}`}>
              <polyline points={item.points.map(point => `${point.x},${point.y}`).join(' ')} />
              {item.points.map((point, pointIndex) => <circle key={`${point.x}-${point.y}-${pointIndex}`} cx={point.x} cy={point.y} r={pointIndex === 0 ? 2.1 : 1.55} />)}
            </g>)}
          </svg>
          {constellations.length === 0 && <span>Choose a memory date</span>}
        </div>
        {availableDates.length === 0 ? <p className="stargazing-empty">No memory dates have been entered yet.</p> : <fieldset className="stargazing-date-list">
          <legend>Optional memory stars</legend>
          {availableDates.map(({ slot, date }) => <label key={`${date}-${slot}`}>
            <input type="checkbox" checked={selectedDates.includes(date)} onChange={event => toggleDate(date, event.target.checked)} />
            <span>Memory {slot + 1} <time>{date}</time></span>
          </label>)}
        </fieldset>}
        <div className="world-modal-actions"><button type="button" className="world-modal-secondary" onClick={onClose}>Back to the island</button></div>
      </section>
    </div>
  )
}
