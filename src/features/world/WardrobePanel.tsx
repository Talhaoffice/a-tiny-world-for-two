import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCESSORIES,
  BOTTOMS,
  CLOTH_TINTS,
  EYE_COLORS,
  HAIR_COLORS,
  HAIR_STYLES,
  HATS,
  SHOES,
  SKIN_TONES,
  TOPS,
  TALHA_DEFAULT_LOOK,
  MANNU_DEFAULT_LOOK,
  isPlayerLook,
  randomLook,
  type PlayerLook,
} from './appearanceCatalog'
import { savePlayerLook } from './playerLooks'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import type { CharacterId } from './characters.config'
import './wardrobe.css'

type Tab = 'body' | 'hair' | 'outfit' | 'accessories'

type Props = {
  uid: string
  characterId: CharacterId
  currentLook: Omit<PlayerLook, 'updatedAt'>
  onClose: () => void
  onSaved: (look: Omit<PlayerLook, 'updatedAt'>) => void
}

function hexColor(value: number): string {
  return `#${value.toString(16).padStart(6, '0')}`
}

function mixDark(color: number, amt = 0x18): number {
  const r = Math.max(0, ((color >> 16) & 0xff) - amt)
  const g = Math.max(0, ((color >> 8) & 0xff) - amt)
  const b = Math.max(0, (color & 0xff) - amt)
  return (r << 16) | (g << 8) | b
}

function lighten(color: number, amt = 0x18): number {
  const r = Math.min(255, ((color >> 16) & 0xff) + amt)
  const g = Math.min(255, ((color >> 8) & 0xff) + amt)
  const b = Math.min(255, (color & 0xff) + amt)
  return (r << 16) | (g << 8) | b
}

// ─── Live animated 4x preview canvas ──────────────────────────────────────────

type PreviewPose = 'idle' | 'walk' | 'wave'
type PreviewDir = 'down' | 'left' | 'up' | 'right'

function LookPreview({
  look,
  characterId,
}: {
  look: Omit<PlayerLook, 'updatedAt'>
  characterId: CharacterId
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [direction, setDirection] = useState<PreviewDir>('down')
  const [pose, setPose] = useState<PreviewPose>('idle')
  const [autoRotate, setAutoRotate] = useState(true)

  const bw = characterId === 'talha' ? 2 : 0

  // Animation cycle
  useEffect(() => {
    let animFrame = 0
    let timer = 0

    const interval = setInterval(() => {
      animFrame = (animFrame + 1) % 24
      // Pose progression: idle (0..7), walk (8..19), wave (20..23)
      if (animFrame < 8) setPose('idle')
      else if (animFrame < 20) setPose('walk')
      else setPose('wave')

      // Direction rotation every 6 seconds if auto-rotate is on
      if (autoRotate && animFrame === 0) {
        timer += 1
        if (timer % 3 === 0) {
          setDirection(prev => {
            const order: PreviewDir[] = ['down', 'left', 'up', 'right']
            const nextIdx = (order.indexOf(prev) + 1) % order.length
            return order[nextIdx]
          })
        }
      }
    }, 220)

    return () => clearInterval(interval)
  }, [autoRotate])

  // Canvas render
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, 32, 40)

    function fill(color: number, x: number, y: number, w: number, h: number, shade?: number) {
      ctx!.fillStyle = hexColor(color)
      ctx!.fillRect(x, y, w, h)
      if (shade !== undefined && w > 1 && h > 1) {
        ctx!.fillStyle = hexColor(shade)
        ctx!.fillRect(x + w - 1, y, 1, h)
        ctx!.fillRect(x, y + h - 1, w - 1, 1)
      }
    }

    function dot(color: number, x: number, y: number) {
      ctx!.fillStyle = hexColor(color)
      ctx!.fillRect(x, y, 1, 1)
    }

    const outline = 0x192d39
    const skin = SKIN_TONES[look.skin] || SKIN_TONES[0]
    const skinColor = skin.color
    const skinShadow = skin.shadow
    const skinLight = lighten(skinColor, 0x12)

    const hair = HAIR_COLORS[look.hairColor] || HAIR_COLORS[0]
    const hairColor = hair.color
    const hairShadow = mixDark(hairColor)
    const hairHighlight = lighten(hairColor, 0x20)

    const topColor = CLOTH_TINTS[look.topColor]?.color ?? 0x263b58
    const topShadow = mixDark(topColor)
    const topLight = lighten(topColor, 0x14)

    const bottomColor = CLOTH_TINTS[look.bottomColor]?.color ?? 0x435464
    const bottomShadow = mixDark(bottomColor)

    const shoeColor = CLOTH_TINTS[look.shoesColor]?.color ?? 0x2c2c2c
    const shoeShadow = mixDark(shoeColor)

    const sitting = false
    const breathBob = pose === 'idle' ? 1 : 0
    const bodyTop = (sitting ? 20 : 17) + breathBob
    const gait = pose === 'walk' ? 1 : 0

    const hx = 9 - Math.floor(bw / 2)
    const hw = 14 + bw
    const faceX = 10 - Math.floor(bw / 2)
    const faceW = 12 + bw
    const bodyX = 8 - Math.floor(bw / 2)
    const bodyW = 16 + bw

    const hairStyle = HAIR_STYLES[look.hairStyle]?.id ?? 'short-crop'
    const isLongHair = hairStyle === 'long-straight' || hairStyle === 'long-wavy' || hairStyle === 'messy-long'

    // 1. Long hair back
    if (isLongHair) {
      fill(outline, hx - 1, 3, hw + 2, 17)
      fill(hairColor, hx, 3, hw, 14, hairHighlight)
      fill(hairShadow, hx - 1, 10, 3, 10)
      fill(hairShadow, hx + hw - 2, 10, 3, 10)
    }

    // 2. Face / Head
    fill(skinColor, faceX, 6, faceW, 10, skinShadow)
    dot(skinLight, faceX + 1, 7)
    dot(skinLight, faceX + 2, 7)

    const eyeColor = EYE_COLORS[look.eyes]?.color ?? 0x3d2b1f
    if (direction === 'down') {
      fill(eyeColor, faceX + 2, 10, 2, 2)
      fill(eyeColor, faceX + faceW - 4, 10, 2, 2)
      dot(0xc0806a, faceX + Math.floor(faceW / 2) - 1, 13)
      dot(0xc0806a, faceX + Math.floor(faceW / 2), 13)
    } else if (direction === 'up') {
      fill(hairColor, faceX - 1, 5, faceW + 2, 11)
    } else {
      const eyeX = direction === 'right' ? faceX + faceW - 4 : faceX + 2
      fill(eyeColor, eyeX, 10, 2, 2)
      const noseX = direction === 'right' ? faceX + faceW - 1 : faceX
      dot(skinShadow, noseX, 12)
    }

    // 3. Neck
    const neckX = faceX + Math.floor(faceW / 2) - 2
    fill(skinColor, neckX, 16, 4, 2, skinShadow)

    // 4. Torso & Bottoms
    const bottomStyle = BOTTOMS[look.bottom]?.id ?? 'trousers'
    if (bottomStyle === 'dress' || bottomStyle === 'skirt') {
      fill(outline, bodyX - 1, bodyTop, bodyW + 2, 8)
      fill(topColor, bodyX, bodyTop + 1, bodyW, 7, topShadow)
      fill(outline, bodyX - 2, bodyTop + 8, bodyW + 4, 7)
      fill(bottomColor, bodyX - 1, bodyTop + 9, bodyW + 2, 6, bottomShadow)
    } else {
      fill(outline, bodyX - 1, bodyTop, bodyW + 2, 13)
      fill(topColor, bodyX, bodyTop + 1, bodyW, 12, topShadow)
      const topStyle = TOPS[look.top]?.id ?? 'jacket'
      const midX = bodyX + Math.floor(bodyW / 2)
      if (topStyle === 'jacket') {
        fill(outline, midX, bodyTop + 1, 1, 12)
        fill(0xe9bd68, midX - 1, bodyTop + 3, 3, 2)
      } else if (topStyle === 'cardigan') {
        fill(0x789078, bodyX, bodyTop + 1, 2, 11)
        fill(0x789078, bodyX + bodyW - 2, bodyTop + 1, 2, 11)
        fill(0xe8dcc5, bodyX + 2, bodyTop + 2, bodyW - 4, 9)
      } else if (topStyle === 'hoodie') {
        fill(topShadow, bodyX + 2, bodyTop + 7, bodyW - 4, 4)
      } else if (topStyle === 'sweater') {
        fill(topShadow, bodyX, bodyTop + 11, bodyW, 1)
        fill(topLight, bodyX + 2, bodyTop + 1, bodyW - 4, 2)
      }
    }

    // 5. Arms
    const armLen = 9
    if (pose === 'wave') {
      const rxUp = bodyX + bodyW
      fill(outline, rxUp, bodyTop - 8, 4, 10)
      fill(topColor, rxUp + 1, bodyTop - 7, 2, 8, topShadow)
      fill(skinColor, rxUp, bodyTop - 11, 4, 4)
      fill(outline, bodyX - 4, bodyTop + 2, 4, armLen)
      fill(topColor, bodyX - 3, bodyTop + 2, 2, armLen - 2, topShadow)
    } else {
      const leftArmX = bodyX - 4 - gait
      const rightArmX = bodyX + bodyW + gait
      fill(outline, leftArmX, bodyTop + 2, 4, armLen)
      fill(topColor, leftArmX + 1, bodyTop + 2, 2, armLen - 2, topShadow)
      dot(skinColor, leftArmX + 1, bodyTop + armLen)

      fill(outline, rightArmX, bodyTop + 2, 4, armLen)
      fill(topColor, rightArmX + 1, bodyTop + 2, 2, armLen - 2, topShadow)
      dot(skinColor, rightArmX + 1, bodyTop + armLen)
    }

    // 6. Legs & Shoes
    const legShade = bottomStyle === 'shorts' ? skinShadow : bottomShadow
    const legColor = bottomStyle === 'shorts' ? skinColor : bottomColor
    const lLegY = 29 + Math.max(0, gait)
    const rLegY = 29 + Math.max(0, -gait)
    const legW = 5 + Math.floor(bw / 2)
    fill(outline, bodyX + 1, lLegY, legW, 6)
    fill(legColor, bodyX + 2, lLegY + 1, legW - 2, 5, legShade)
    fill(outline, bodyX + bodyW - legW - 1, rLegY, legW, 6)
    fill(legColor, bodyX + bodyW - legW, rLegY + 1, legW - 2, 5, legShade)

    const lShoeX = bodyX - gait
    const rShoeX = bodyX + bodyW - 7 + gait
    fill(outline, lShoeX, 34, 7, 4)
    fill(shoeColor, lShoeX + 1, 35, 5, 3, shoeShadow)
    fill(outline, rShoeX, 34, 7, 4)
    fill(shoeColor, rShoeX + 1, 35, 5, 3, shoeShadow)

    // 7. Hair front
    fill(outline, hx - 1, 2, hw + 2, 7)
    fill(hairColor, hx, 3, hw, 6, hairHighlight)
    if (hairStyle === 'messy-short' || hairStyle === 'curly') {
      dot(hairColor, hx + 1, 2)
      dot(hairColor, hx + 3, 2)
      dot(hairColor, hx + 5, 2)
    } else if (hairStyle === 'bun') {
      fill(hairColor, hx + Math.floor(hw / 2) - 2, 0, 5, 3, hairHighlight)
    }

    // 8. Hats
    const hatStyle = HATS[look.hat]?.id ?? 'none'
    if (hatStyle === 'cap') {
      fill(outline, hx - 1, 1, hw + 2, 4)
      fill(0x263b58, hx, 2, hw, 3, 0x192d39)
      fill(0x263b58, hx, 5, hw, 1)
    } else if (hatStyle === 'beanie') {
      fill(outline, hx - 1, 0, hw + 2, 6)
      fill(0xc98575, hx, 1, hw, 5, 0x9b5d50)
      fill(0xd9a08c, hx - 1, 5, hw + 2, 2)
    } else if (hatStyle === 'flower-crown') {
      fill(0x789078, hx, 4, hw, 1)
      dot(0xe9bd68, hx + 1, 3)
      dot(0xc98575, hx + 4, 3)
      dot(0xfffbf0, hx + 7, 3)
      dot(0xc98575, hx + 10, 3)
    }

    // 9. Accessories
    const accStyle = ACCESSORIES[look.accessory]?.id ?? 'none'
    if (accStyle === 'glasses' && direction !== 'up') {
      fill(0xb8924a, faceX + 1, 9, 4, 3)
      fill(skinColor, faceX + 2, 10, 2, 1)
      fill(0xb8924a, faceX + faceW - 5, 9, 4, 3)
      fill(skinColor, faceX + faceW - 4, 10, 2, 1)
    } else if (accStyle === 'scarf') {
      fill(0x789078, neckX - 2, 15, 8, 3, 0x5a6e5a)
      fill(0x789078, neckX + 1, 18, 3, 4, 0x5a6e5a)
    } else if (accStyle === 'hair-clip') {
      fill(0xe9bd68, hx + hw - 2, 7, 3, 2)
    } else if (accStyle === 'lantern-pin') {
      dot(0xe9bd68, bodyX + 3, bodyTop + 3)
    }
  }, [look, bw, direction, pose])

  function handleTurn(d: 'prev' | 'next') {
    setAutoRotate(false)
    const dirs: PreviewDir[] = ['down', 'left', 'up', 'right']
    setDirection(prev => {
      const idx = dirs.indexOf(prev)
      const nextIdx = d === 'next' ? (idx + 1) % dirs.length : (idx - 1 + dirs.length) % dirs.length
      return dirs[nextIdx]
    })
  }

  return (
    <div className="wardrobe-preview-container">
      <div className="wardrobe-preview-frame">
        <canvas
          ref={canvasRef}
          width={32}
          height={40}
          className="wardrobe-preview-canvas"
          aria-label={`Character preview facing ${direction}, posing ${pose}`}
        />
      </div>
      <div className="wardrobe-turn-controls">
        <button
          type="button"
          className="wardrobe-turn-btn"
          onClick={() => handleTurn('prev')}
          aria-label="Turn character left"
        >
          ↶
        </button>
        <span className="wardrobe-turn-label">{direction} · {pose}</span>
        <button
          type="button"
          className="wardrobe-turn-btn"
          onClick={() => handleTurn('next')}
          aria-label="Turn character right"
        >
          ↷
        </button>
      </div>
    </div>
  )
}

// ─── Swatch & Option Grids ────────────────────────────────────────────────────

function ColorGrid<T extends number>({
  items,
  selected,
  getId,
  onChange,
  ariaLabel,
}: {
  items: readonly { label: string; color: number }[]
  selected: T
  getId: (i: number) => string
  onChange: (i: T) => void
  ariaLabel: string
}) {
  return (
    <div className="wardrobe-color-grid" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={selected === i}
          aria-label={item.label}
          id={getId(i)}
          className={`wardrobe-swatch${selected === i ? ' wardrobe-swatch--selected' : ''}`}
          style={{ background: hexColor(item.color) }}
          onClick={() => onChange(i as T)}
          title={item.label}
        />
      ))}
    </div>
  )
}

function OptionGrid<T extends number>({
  items,
  selected,
  onChange,
  ariaLabel,
}: {
  items: readonly { label: string }[]
  selected: T
  onChange: (i: T) => void
  ariaLabel: string
}) {
  return (
    <div className="wardrobe-option-grid" role="radiogroup" aria-label={ariaLabel}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={selected === i}
          aria-label={item.label}
          className={`wardrobe-option${selected === i ? ' wardrobe-option--selected' : ''}`}
          onClick={() => onChange(i as T)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

// ─── Main wardrobe panel ──────────────────────────────────────────────────────

export function WardrobePanel({ uid, characterId, currentLook, onClose, onSaved }: Props) {
  const defaults = characterId === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK
  const [draft, setDraft] = useState<Omit<PlayerLook, 'updatedAt'>>(currentLook)
  const [tab, setTab] = useState<Tab>('body')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useState(false)
  const [sparkling, setSparkling] = useState(false)
  const hasChanges = JSON.stringify(draft) !== JSON.stringify(currentLook)
  const busyRef = useRef(false)

  function setField<K extends keyof Omit<PlayerLook, 'updatedAt'>>(key: K, value: Omit<PlayerLook, 'updatedAt'>[K]) {
    setDraft(prev => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = useCallback(async () => {
    if (busyRef.current) return
    if (!isPlayerLook(draft)) {
      setMessage('Please choose a valid combination before saving.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setMessage('')
    try {
      await savePlayerLook(uid, draft)
      onSaved(draft)
      setSaved(true)
      setSparkling(true)
      setMessage('Looks good! ✨')
      setTimeout(() => setSparkling(false), 1400)

      // Pleasant Web Audio chord chime
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
        const ctx = new AudioCtx()
        const now = ctx.currentTime
        const notes = [523.25, 659.25, 783.99, 1046.50] // C5, E5, G5, C6 arpeggio
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator()
          const gain = ctx.createGain()
          osc.type = 'sine'
          osc.frequency.value = freq
          const start = now + idx * 0.07
          gain.gain.setValueAtTime(0, start)
          gain.gain.linearRampToValueAtTime(0.06, start + 0.02)
          gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
          osc.connect(gain)
          gain.connect(ctx.destination)
          osc.start(start)
          osc.stop(start + 0.36)
        })
        setTimeout(() => { void ctx.close() }, 900)
      } catch {
        /* audio failure is silent */
      }
    } catch (err) {
      logError(err, 'firestore/wardrobe-save')
      setMessage(toAppError(err).userMessage)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }, [draft, uid, onSaved])

  function handleReset() {
    setDraft(defaults)
    setSaved(false)
    setMessage('')
  }

  function handleRandomize() {
    setDraft(randomLook())
    setSaved(false)
    setMessage('')
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'body', label: 'Body' },
    { id: 'hair', label: 'Hair' },
    { id: 'outfit', label: 'Outfit' },
    { id: 'accessories', label: 'Accessories' },
  ]

  return (
    <div className="wardrobe-overlay" role="presentation">
      <section
        className={`wardrobe-panel${sparkling ? ' wardrobe-panel--sparkling' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="wardrobe-title"
      >
        <div className="wardrobe-header">
          <div>
            <h2 id="wardrobe-title" className="wardrobe-title">Wardrobe & Creator</h2>
            <p className="wardrobe-subtitle">Change how your character looks on the island.</p>
          </div>
          <button
            type="button"
            className="wardrobe-close"
            aria-label="Close wardrobe"
            onClick={() => {
              if (hasChanges && !saved) {
                if (!window.confirm('You have unsaved changes. Close anyway?')) return
              }
              onClose()
            }}
          >
            ×
          </button>
        </div>

        <div className="wardrobe-body">
          {/* Live Preview */}
          <div className="wardrobe-preview">
            <LookPreview look={draft} characterId={characterId} />
            <div className="wardrobe-preview-actions">
              <button type="button" className="wardrobe-btn-secondary" onClick={handleRandomize}>Randomize</button>
              <button type="button" className="wardrobe-btn-secondary" onClick={handleReset}>Default</button>
            </div>
            {sparkling && <div className="wardrobe-sparkle-burst" aria-hidden="true">✦ ✨ ✦</div>}
          </div>

          {/* Tabs + Content */}
          <div className="wardrobe-editor">
            <div className="wardrobe-tabs" role="tablist" aria-label="Customisation categories">
              {TABS.map(t => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  aria-controls={`wardrobe-tab-${t.id}`}
                  id={`wardrobe-tab-btn-${t.id}`}
                  className={`wardrobe-tab${tab === t.id ? ' wardrobe-tab--active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div
              id={`wardrobe-tab-${tab}`}
              role="tabpanel"
              aria-labelledby={`wardrobe-tab-btn-${tab}`}
              className="wardrobe-tab-panel"
            >
              {tab === 'body' && (
                <>
                  <label className="wardrobe-section-label">Skin tone</label>
                  <ColorGrid
                    items={SKIN_TONES}
                    selected={draft.skin}
                    getId={i => `skin-${i}`}
                    onChange={v => setField('skin', v)}
                    ariaLabel="Skin tone"
                  />
                  <label className="wardrobe-section-label">Eye color</label>
                  <ColorGrid
                    items={EYE_COLORS}
                    selected={draft.eyes}
                    getId={i => `eye-${i}`}
                    onChange={v => setField('eyes', v)}
                    ariaLabel="Eye color"
                  />
                </>
              )}
              {tab === 'hair' && (
                <>
                  <label className="wardrobe-section-label">Hair style</label>
                  <OptionGrid
                    items={HAIR_STYLES}
                    selected={draft.hairStyle}
                    onChange={v => setField('hairStyle', v)}
                    ariaLabel="Hair style"
                  />
                  <label className="wardrobe-section-label">Hair color</label>
                  <ColorGrid
                    items={HAIR_COLORS}
                    selected={draft.hairColor}
                    getId={i => `hair-color-${i}`}
                    onChange={v => setField('hairColor', v)}
                    ariaLabel="Hair color"
                  />
                </>
              )}
              {tab === 'outfit' && (
                <>
                  <label className="wardrobe-section-label">Top</label>
                  <OptionGrid items={TOPS} selected={draft.top} onChange={v => setField('top', v)} ariaLabel="Top" />
                  <label className="wardrobe-section-label">Top color</label>
                  <ColorGrid items={CLOTH_TINTS} selected={draft.topColor} getId={i => `tc-${i}`} onChange={v => setField('topColor', v)} ariaLabel="Top color" />
                  <label className="wardrobe-section-label">Bottom</label>
                  <OptionGrid items={BOTTOMS} selected={draft.bottom} onChange={v => setField('bottom', v)} ariaLabel="Bottom" />
                  <label className="wardrobe-section-label">Bottom color</label>
                  <ColorGrid items={CLOTH_TINTS} selected={draft.bottomColor} getId={i => `bc-${i}`} onChange={v => setField('bottomColor', v)} ariaLabel="Bottom color" />
                  <label className="wardrobe-section-label">Shoes</label>
                  <OptionGrid items={SHOES} selected={draft.shoes} onChange={v => setField('shoes', v)} ariaLabel="Shoes" />
                  <label className="wardrobe-section-label">Shoes color</label>
                  <ColorGrid items={CLOTH_TINTS} selected={draft.shoesColor} getId={i => `sc-${i}`} onChange={v => setField('shoesColor', v)} ariaLabel="Shoes color" />
                </>
              )}
              {tab === 'accessories' && (
                <>
                  <label className="wardrobe-section-label">Hat</label>
                  <OptionGrid
                    items={HATS}
                    selected={draft.hat}
                    onChange={v => setField('hat', v)}
                    ariaLabel="Hat"
                  />
                  <label className="wardrobe-section-label">Accessory</label>
                  <OptionGrid
                    items={ACCESSORIES}
                    selected={draft.accessory}
                    onChange={v => setField('accessory', v)}
                    ariaLabel="Accessory"
                  />
                </>
              )}
            </div>

            {/* Actions */}
            <div className="wardrobe-actions">
              {message && (
                <p
                  className={`wardrobe-message${saved ? ' wardrobe-message--ok' : ''}`}
                  role="status"
                >
                  {message}
                </p>
              )}
              <div className="wardrobe-action-buttons">
                <button
                  type="button"
                  className="wardrobe-btn-secondary"
                  onClick={() => {
                    if (hasChanges && !saved) {
                      if (!window.confirm('Discard unsaved changes?')) return
                    }
                    onClose()
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="wardrobe-btn-primary"
                  disabled={busy}
                  onClick={() => { void handleSave() }}
                >
                  {busy ? 'Saving…' : saved ? 'Saved ✓' : 'Save look'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
