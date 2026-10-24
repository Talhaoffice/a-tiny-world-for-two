import { useEffect, useRef, useState } from 'react'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { deriveGardenCornerEffects, type GardenCornerEffects } from './gardenCornerEffects'
import {
  emptyGreenhouseCorner,
  emptyLanternCorner,
  saveGreenhouseCorner,
  saveLanternCorner,
  watchPersonalCorners,
  type GreenhouseCornerState,
  type LanternCornerState,
  type PersonalCornerState,
} from './personalCornerContent'

export type PersonalCornerId = 'lantern-post' | 'greenhouse'

type Props = {
  uid: string
  talhaUid: string
  mannuUid: string
  active: PersonalCornerId
  onClose: () => void
  onOpenWardrobe: () => void
  onEffects: (effects: GardenCornerEffects) => void
}

const emptyState: PersonalCornerState = { lantern: emptyLanternCorner, greenhouse: emptyGreenhouseCorner }

export function PersonalCornerPanel({ uid, talhaUid, mannuUid, active, onClose, onOpenWardrobe, onEffects }: Props) {
  const [corners, setCorners] = useState<PersonalCornerState>(emptyState)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [fishing, setFishing] = useState(false)
  const fishingTimer = useRef<number | null>(null)

  useEffect(() => {
    let mounted = true
    const stop = watchPersonalCorners(talhaUid, mannuUid, next => {
      if (!mounted) return
      setCorners(next)
      onEffects(deriveGardenCornerEffects(next.lantern, next.greenhouse))
    }, readError => {
      if (mounted) setError(toAppError(readError).userMessage)
    })
    return () => { mounted = false; stop() }
  }, [mannuUid, onEffects, talhaUid])

  useEffect(() => () => {
    if (fishingTimer.current !== null) window.clearTimeout(fishingTimer.current)
  }, [])

  async function changeLantern(next: LanternCornerState) {
    if (busy || uid !== talhaUid) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveLanternCorner(uid, talhaUid, next)
      const updated = { ...corners, lantern: next }
      setCorners(updated)
      onEffects(deriveGardenCornerEffects(updated.lantern, updated.greenhouse))
      setMessage('The lantern corner is saved.')
    } catch (saveError) {
      logError(saveError, 'game/lantern-corner-save')
      setError(toAppError(saveError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  async function changeGreenhouse(next: GreenhouseCornerState) {
    if (busy || uid !== mannuUid) return
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await saveGreenhouseCorner(uid, mannuUid, next)
      const updated = { ...corners, greenhouse: next }
      setCorners(updated)
      onEffects(deriveGardenCornerEffects(updated.lantern, updated.greenhouse))
      setMessage('The greenhouse is saved.')
    } catch (saveError) {
      logError(saveError, 'game/greenhouse-corner-save')
      setError(toAppError(saveError).userMessage)
    } finally {
      setBusy(false)
    }
  }

  function castLine() {
    if (fishingTimer.current !== null) window.clearTimeout(fishingTimer.current)
    setFishing(true)
    setMessage('A tiny ripple crosses the pond. Nothing was saved.')
    fishingTimer.current = window.setTimeout(() => setFishing(false), 1500)
  }

  const lanternOwner = uid === talhaUid
  const greenhouseOwner = uid === mannuUid
  const effects = deriveGardenCornerEffects(corners.lantern, corners.greenhouse)

  return (
    <div className="personal-corner-panel" role="presentation">
      <section className="world-modal-card world-modal-card--corner" role="dialog" aria-modal="true" aria-labelledby="corner-title">
        <button type="button" className="world-modal-close" aria-label="Close corner" onClick={onClose}>×</button>
        <p className="world-modal-eyebrow">A place for both of you</p>
        {active === 'lantern-post' ? <>
          <h2 id="corner-title">Talha’s Lantern Post &amp; Workshop</h2>
          <p>Visit together. Talha can tend the lamps; either of you can try a little fishing cast.</p>
          <div className="corner-controls">
            <button type="button" disabled={!lanternOwner || busy} aria-pressed={corners.lantern.postLanternLit}
              onClick={() => { void changeLantern({ ...corners.lantern, postLanternLit: !corners.lantern.postLanternLit }) }}>
              Post lantern: {corners.lantern.postLanternLit ? 'Lit' : 'Unlit'}
            </button>
            <button type="button" disabled={!lanternOwner || busy} aria-pressed={corners.lantern.workshopLanternLit}
              onClick={() => { void changeLantern({ ...corners.lantern, workshopLanternLit: !corners.lantern.workshopLanternLit }) }}>
              Workshop lantern: {corners.lantern.workshopLanternLit ? 'Lit' : 'Unlit'}
            </button>
          </div>
          <label htmlFor="lantern-decoration">Small decoration</label>
          <select id="lantern-decoration" disabled={!lanternOwner || busy} value={corners.lantern.decoration}
            onChange={event => { void changeLantern({ ...corners.lantern, decoration: event.target.value as LanternCornerState['decoration'] }) }}>
            <option value="none">No extra decoration</option><option value="wind-chime">Wind chime</option><option value="flower-box">Flower box</option>
          </select>
          <button type="button" className={`corner-fishing${fishing ? ' corner-fishing--active' : ''}`} onClick={castLine}>Try a quiet fishing cast</button>
          {effects.lanternGlow && <p className="corner-effect-note">The garden flowers catch a soft lantern glow.</p>}
          {!lanternOwner && <p className="corner-owner-note">These settings belong to Talha. You can still visit and fish.</p>}
        </> : <>
          <h2 id="corner-title">Mannu’s Greenhouse &amp; Dressing Nook</h2>
          <p>Visit together. Mannu can water the flowers and arrange this shared little corner.</p>
          <div className="corner-controls">
            <button type="button" disabled={!greenhouseOwner || busy} aria-pressed={corners.greenhouse.plotOneWatered}
              onClick={() => { void changeGreenhouse({ ...corners.greenhouse, plotOneWatered: !corners.greenhouse.plotOneWatered }) }}>
              Plot one: {corners.greenhouse.plotOneWatered ? 'Watered' : 'Needs water'}
            </button>
            <button type="button" disabled={!greenhouseOwner || busy} aria-pressed={corners.greenhouse.plotTwoWatered}
              onClick={() => { void changeGreenhouse({ ...corners.greenhouse, plotTwoWatered: !corners.greenhouse.plotTwoWatered }) }}>
              Plot two: {corners.greenhouse.plotTwoWatered ? 'Watered' : 'Needs water'}
            </button>
          </div>
          <label htmlFor="greenhouse-decoration">Small decoration</label>
          <select id="greenhouse-decoration" disabled={!greenhouseOwner || busy} value={corners.greenhouse.decoration}
            onChange={event => { void changeGreenhouse({ ...corners.greenhouse, decoration: event.target.value as GreenhouseCornerState['decoration'] }) }}>
            <option value="none">No extra decoration</option><option value="herb-shelf">Herb shelf</option><option value="plant-stand">Plant stand</option>
          </select>
          <button type="button" className="world-modal-secondary" onClick={onOpenWardrobe}>Open the shared wardrobe</button>
          {effects.gardenFireflies && <p className="corner-effect-note">Watered flowers invite little fireflies to the garden.</p>}
          {!greenhouseOwner && <p className="corner-owner-note">These settings belong to Mannu. You can still visit and choose your own look.</p>}
        </>}
        {(error || message) && <p className={error ? 'world-modal-message world-modal-message--error' : 'world-modal-message'} role="status">{error || message}</p>}
        <div className="world-modal-actions">
          <button type="button" className="world-modal-secondary" onClick={onClose}>Return to the island</button>
        </div>
      </section>
    </div>
  )
}

