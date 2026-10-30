import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { logError } from '../../lib/logger'
import { isEditableTarget } from './keyboardInput'
import {
  CATCH_ZONE_HEIGHT,
  FISHING_REEL_LIMIT_MS,
  advanceFishing,
  cancelFishing,
  getFishById,
  releaseFishing,
  retryFishing,
  startFishing,
  type FishingState,
} from './pondLife'
import './fishing.css'

type Props = { reducedMotion: boolean; lowPower: boolean; onClose: () => void }

export function FishingGamePanel({ reducedMotion, lowPower, onClose }: Props) {
  const seedCounter = useRef(0)
  const [model, setModel] = useState(() => startFishing(Date.now(), Date.now(), reducedMotion))
  const [holding, setHolding] = useState(false)
  const [hasError, setHasError] = useState(false)
  const modelRef = useRef(model)
  const holdingRef = useRef(holding)
  const onCloseRef = useRef(onClose)
  modelRef.current = model
  holdingRef.current = holding
  onCloseRef.current = onClose
  const fish = getFishById(model.fishId)

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (hasError) return
      try {
        const current = modelRef.current
        const next = advanceFishing(current, Date.now(), 50, holdingRef.current)
        if (next !== current) {
          modelRef.current = next
          setModel(next)
        }
      } catch (error) {
        logError(error, 'fishing/state-machine')
        setHasError(true)
        setHolding(false)
      }
    }, 50)
    return () => window.clearInterval(timer)
  }, [hasError])

  useEffect(() => {
    if (model.stage === 'idle') onCloseRef.current()
  }, [model.stage])

  useEffect(() => {
    const keyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        const cancelled = cancelFishing(modelRef.current, Date.now())
        modelRef.current = cancelled
        setModel(cancelled)
        setHolding(false)
        onCloseRef.current()
        return
      }
      if (event.code !== 'Space' || modelRef.current.stage !== 'reel') return
      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) return
      event.preventDefault()
      setHolding(true)
    }
    const keyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setHolding(false)
    }
    const release = () => setHolding(false)
    window.addEventListener('keydown', keyDown, true)
    window.addEventListener('keyup', keyUp, true)
    window.addEventListener('blur', release)
    return () => {
      window.removeEventListener('keydown', keyDown, true)
      window.removeEventListener('keyup', keyUp, true)
      window.removeEventListener('blur', release)
    }
  }, [])

  function startAgain() {
    seedCounter.current += 1
    try {
      const now = Date.now()
      const seed = (now + seedCounter.current * 0x9e3779b9) >>> 0
      const next = model.stage === 'miss'
        ? retryFishing(model, seed, now, reducedMotion)
        : startFishing(seed, now, reducedMotion)
      modelRef.current = next
      setModel(next)
      setHolding(false)
      setHasError(false)
    } catch (error) {
      logError(error, 'fishing/retry')
      setHasError(true)
    }
  }

  function beginHold(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer capture may be unavailable */ }
    setHolding(true)
  }

  function finishHold() {
    setHolding(false)
  }

  function releaseCatch() {
    const next = releaseFishing(modelRef.current, Date.now())
    modelRef.current = next
    setModel(next)
  }

  if (hasError) {
    return <section className="fishing-panel" aria-labelledby="fishing-title" role="alert">
      <header className="fishing-panel__header"><div><p className="eyebrow">Pond activity</p><h2 id="fishing-title">A small pause</h2></div><button type="button" className="fishing-panel__close" onClick={() => onCloseRef.current()} aria-label="Close fishing">×</button></header>
      <p>The fishing game could not continue. You can try again or return to the island.</p>
      <div className="fishing-panel__actions"><button type="button" onClick={startAgain}>Try again</button><button type="button" className="fishing-panel__secondary" onClick={() => onCloseRef.current()}>Return to island</button></div>
    </section>
  }

  return <section className={`fishing-panel${reducedMotion ? ' fishing-panel--reduced' : ''}${lowPower ? ' fishing-panel--low-power' : ''}`} aria-labelledby="fishing-title">
    <header className="fishing-panel__header">
      <div><p className="eyebrow">Pond activity · no score</p><h2 id="fishing-title">A little fishing</h2></div>
      <button type="button" className="fishing-panel__close" onClick={() => {
        const cancelled = cancelFishing(modelRef.current, Date.now())
        modelRef.current = cancelled
        setModel(cancelled)
        setHolding(false)
        onCloseRef.current()
      }} aria-label="Cancel fishing">×</button>
    </header>

    <p className="fishing-panel__status" role="status" aria-live="polite">{stageMessage(model.stage)}</p>
    <div className={`fishing-cast-scene fishing-cast-scene--${model.stage}`} aria-hidden="true">
      <svg viewBox="0 0 220 74" focusable="false">
        <path className="fishing-cast-scene__rod" d="M30 57 Q42 45 50 11" />
        <path className="fishing-cast-scene__line" d={model.stage === 'cast' ? 'M50 11 Q105 12 151 58' : 'M50 11 Q100 28 151 54'} />
        <ellipse className="fishing-cast-scene__ripple" cx="151" cy="61" rx="20" ry="4" />
        <circle className="fishing-cast-scene__bobber" cx="151" cy="53" r="5" />
        {model.stage === 'bite' && <text className="fishing-cast-scene__bite" x="166" y="36">!</text>}
        {model.stage === 'release' && <path className="fishing-cast-scene__splash" d="M140 56l-7-9m18 9 7-10m-8 12 1-14" />}
      </svg>
    </div>

    {model.stage === 'reel' && <div className="fishing-reel">
      <div className="fishing-reel__track" role="img" aria-label={`Fish position ${Math.round(model.fishPosition * 100)} percent up the water bar`}>
        <span className="fishing-reel__zone" style={{ bottom: `${(model.zoneCenter - CATCH_ZONE_HEIGHT / 2) * 100}%`, height: `${CATCH_ZONE_HEIGHT * 100}%` }} />
        <span className="fishing-reel__fish" style={{ bottom: `${model.fishPosition * 100}%` }} aria-label={fish.name}>{fishIcon(fish.color)}</span>
      </div>
      <div className="fishing-reel__details">
        <p>Hold Space or the button to lift the catch zone. Release to lower it.</p>
        <div className="fishing-reel__progress-row">
          <span>{Math.max(0, Math.ceil((FISHING_REEL_LIMIT_MS - model.reelElapsedMs) / 1000))} seconds</span>
          <svg className="fishing-reel__progress-ring" viewBox="0 0 40 40" role="meter" aria-label="Fish in catch zone progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(model.progress * 100)}>
            <circle className="fishing-reel__progress-track" cx="20" cy="20" r="16" />
            <circle className="fishing-reel__progress-fill" cx="20" cy="20" r="16" style={{ strokeDashoffset: `${100.53 * (1 - model.progress)}` }} />
            <text x="20" y="23" textAnchor="middle">{Math.round(model.progress * 100)}%</text>
          </svg>
        </div>
      </div>
      <button type="button" className={`fishing-reel__hold${holding ? ' fishing-reel__hold--active' : ''}`} aria-pressed={holding} onPointerDown={beginHold} onPointerUp={finishHold} onPointerCancel={finishHold} onLostPointerCapture={finishHold} onContextMenu={event => event.preventDefault()}>
        Hold to reel
      </button>
    </div>}

    {model.stage === 'catch' && <div className="fishing-catch" role="status">
      <div className="fishing-catch__leap" aria-hidden="true">{fishIcon(fish.color)}</div>
      <p className="eyebrow">A small catch</p><h3>{fish.name}</h3>
      <button type="button" onClick={releaseCatch}>Release gently</button>
    </div>}

    {model.stage === 'miss' && <div className="fishing-miss" role="status">
      <p>The fish slipped away. Try again whenever you like.</p>
      <button type="button" onClick={startAgain}>Cast again</button>
    </div>}

    {model.stage === 'idle' && <p className="fishing-panel__status">Returning to the island…</p>}
  </section>
}

function stageMessage(stage: FishingState['stage']) {
  switch (stage) {
    case 'cast': return 'Cast the line and watch the bobber land.'
    case 'wait': return 'The bobber is floating. Wait for a bite.'
    case 'bite': return 'A bite! Get ready to reel.'
    case 'reel': return 'Keep the fish inside the catch zone.'
    case 'catch': return 'A little fish came to say hello.'
    case 'release': return 'The fish is heading back to the pond.'
    case 'miss': return 'That one got away.'
    default: return 'Returning to the island…'
  }
}

function fishIcon(color: number) {
  const hex = `#${color.toString(16).padStart(6, '0')}`
  return <svg viewBox="0 0 48 28" focusable="false"><path d="M4 14 0 5l11 5c8-8 22-8 30 4-8 12-22 12-30 4L0 23z" fill={hex} stroke="#263747" strokeWidth="2" /><circle cx="33" cy="12" r="1.7" fill="#263747" /></svg>
}
