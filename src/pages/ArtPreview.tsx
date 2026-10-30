/**
 * ArtPreview — visible at ?art=1 in dev and production builds.
 * No Firebase, no auth. Renders all character frames directly on <canvas>.
 */
import { useEffect, useRef, useState } from 'react'
import { characters } from '../features/world/characters.config'
import type { CharacterConfig } from '../features/world/characters.config'
import { FISH_CATALOG } from '../features/world/pondLife'

const SCALE = 4
const FRAME_W = 32
const FRAME_H = 40

// ─── Pixel art helpers (pure canvas, no Phaser) ──────────────────────────────

function px(
  ctx: CanvasRenderingContext2D,
  color: number,
  x: number, y: number, w: number, h: number,
  shade?: number,
) {
  ctx.fillStyle = hexCss(color)
  ctx.fillRect(x, y, w, h)
  if (shade !== undefined && w > 1 && h > 1) {
    ctx.fillStyle = hexCss(shade)
    ctx.fillRect(x + w - 1, y, 1, h)
    ctx.fillRect(x, y + h - 1, w - 1, 1)
  }
}

function dot(ctx: CanvasRenderingContext2D, color: number, x: number, y: number) {
  ctx.fillStyle = hexCss(color)
  ctx.fillRect(x, y, 1, 1)
}

function hexCss(n: number): string {
  return '#' + n.toString(16).padStart(6, '0')
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

// ─── Draw a single character frame to a canvas context ───────────────────────

type Pose = 'idle' | 'walk' | 'wave' | 'sit' | 'sleep'
type Dir  = 'down' | 'left' | 'right' | 'up'
type Appearance = CharacterConfig['defaultAppearance']

function drawFrame(
  ctx: CanvasRenderingContext2D,
  cfg: CharacterConfig,
  appearance: Appearance,
  pose: Pose,
  direction: Dir,
  frame: number,
) {
  const { palette, footwear } = cfg
  const bw = cfg.bodyWidthOffset
  const outfitColor = appearance.outfit === 'jacket'
    ? palette.jacket
    : appearance.outfit === 'cardigan' ? palette.cardigan : palette.dress
  const outfitShade = mixDark(outfitColor)
  if (pose === 'sleep') {
    px(ctx, 0xe8dcc5, 2, 20, 15, 13, 0xb9a98a)
    px(ctx, palette.outline, 3, 18, 14, 10)
    px(ctx, palette.hair, 4, 18, 12, 5, palette.hairHighlight)
    px(ctx, palette.skin, 7, 21, 9, 7, palette.skinShadow)
    dot(ctx, palette.outline, 10, 24)
    dot(ctx, palette.outline, 13, 24)
    px(ctx, palette.outline, 15, 22, 15, 14)
    px(ctx, palette.sage, 16, 23, 13, 11, mixDark(palette.sage))
    px(ctx, palette.sage, 16, 21, 14, 11, 0x5a6e5a)
    px(ctx, 0xb4c4b4, 18, 22, 10, 1)
    return
  }
  const sitting = pose === 'sit'
  const breathBob = (pose === 'idle' && frame === 1) ? 1 : 0
  const bodyTop = (sitting ? 20 : 17) + breathBob
  const gaitArr = [-2, -1, 1, 2, 1, -1]
  const gait = pose === 'walk' ? gaitArr[frame] ?? 0 : 0

  const isLong = appearance.hair === 'long'
  const hx = 9 - Math.floor(bw / 2)
  const hw = 14 + bw

  // Hair
  if (isLong) {
    px(ctx, palette.outline, hx - 1, 3, hw + 2, 17)
    px(ctx, palette.hair, hx, 3, hw, 13, palette.hairHighlight)
    px(ctx, palette.hair, hx - 1, 10, 3, 10)
    px(ctx, palette.hair, hx + hw - 2, 10, 3, 10)
    dot(ctx, palette.hairHighlight, hx, 4)
    dot(ctx, palette.hairHighlight, hx + 1, 3)
    if (appearance.accessory === 'lantern-clip' || appearance.accessory === 'sage-accent') {
      const clipColor = appearance.accessory === 'lantern-clip' ? palette.gold : palette.sage
      const clipX = direction === 'left' ? hx - 1 : hx + hw - 2
      px(ctx, clipColor, clipX, 8, 3, 2)
    }
  } else {
    px(ctx, palette.outline, hx - 1, 2, hw + 2, 11)
    px(ctx, palette.hair, hx, 3, hw, 8, palette.hairHighlight)
    dot(ctx, palette.hair, hx + 1, 2)
    dot(ctx, palette.hair, hx + 3, 2)
    dot(ctx, palette.hair, hx + 5, 2)
    dot(ctx, palette.hair, hx + 7, 2)
    dot(ctx, palette.hairHighlight, hx + 2, 3)
    dot(ctx, palette.hairHighlight, hx + 6, 3)
    if (appearance.outfit === 'jacket') {
      px(ctx, palette.gold, hx, 11, hw, 2)
    }
  }

  // Face
  const faceX = 10 - Math.floor(bw / 2)
  const faceW = 12 + bw
  px(ctx, palette.skin, faceX, 6, faceW, 10, palette.skinShadow)
  dot(ctx, lighten(palette.skin, 0x18), faceX + 1, 7)
  dot(ctx, lighten(palette.skin, 0x10), faceX + 2, 7)
  if (direction === 'down') {
    px(ctx, palette.outline, faceX + 2, 10, 2, 2)
    px(ctx, palette.outline, faceX + 8, 10, 2, 2)
    dot(ctx, 0xc0806a, faceX + 4, 13)
    dot(ctx, 0xc0806a, faceX + 5, 13)
  } else if (direction === 'up') {
    px(ctx, palette.hair, faceX - 1, 5, faceW + 2, 11)
  } else {
    const eyeX = direction === 'right' ? faceX + 7 : faceX + 1
    px(ctx, palette.outline, eyeX, 10, 2, 2)
    const noseX = direction === 'right' ? faceX + faceW - 1 : faceX
    dot(ctx, palette.skinShadow, noseX, 12)
  }

  // Neck
  const neckX = faceX + Math.floor(faceW / 2) - 2
  px(ctx, palette.skin, neckX, 16, 4, 2, palette.skinShadow)

  // Body
  const bodyX = 8 - Math.floor(bw / 2)
  const bodyW = 16 + bw
  if (appearance.outfit === 'dress') {
    px(ctx, palette.outline, bodyX - 1, bodyTop, bodyW + 2, 8)
    px(ctx, outfitColor, bodyX, bodyTop + 1, bodyW, 7, outfitShade)
    px(ctx, palette.outline, bodyX - 2, bodyTop + 8, bodyW + 4, 7)
    px(ctx, outfitColor, bodyX - 1, bodyTop + 9, bodyW + 2, 6, outfitShade)
    if (appearance.accessory === 'sage-accent') px(ctx, palette.sage, bodyX, bodyTop + 7, bodyW, 2)
    px(ctx, 0xe8dcc5, bodyX + 2, bodyTop + 1, 3, 3)
  } else {
    px(ctx, palette.outline, bodyX - 1, bodyTop, bodyW + 2, 13)
    px(ctx, outfitColor, bodyX, bodyTop + 1, bodyW, 12, outfitShade)
    if (appearance.outfit === 'jacket') {
      const midX = bodyX + Math.floor(bodyW / 2)
      px(ctx, palette.outline, midX, bodyTop + 1, 1, 12)
      px(ctx, palette.gold, midX - 1, bodyTop + 3, 3, 2)
      px(ctx, 0xe8dcc5, bodyX, bodyTop + 1, 3, 2)
      px(ctx, 0xe8dcc5, bodyX + bodyW - 3, bodyTop + 1, 3, 2)
    } else {
      px(ctx, palette.sage, bodyX, bodyTop + 1, 2, 11)
      px(ctx, palette.sage, bodyX + bodyW - 2, bodyTop + 1, 2, 11)
      px(ctx, 0xe8dcc5, bodyX + 2, bodyTop + 2, bodyW - 4, 9)
    }
  }

  // Arms
  const armLen = 9
  if (pose === 'wave') {
    const waveLeft = direction === 'left'
    const rxUp = waveLeft ? bodyX - 4 : bodyX + bodyW
    px(ctx, palette.outline, rxUp, bodyTop - 8, 4, 10)
    px(ctx, outfitColor, rxUp + 1, bodyTop - 7, 2, 8, outfitShade)
    px(ctx, palette.skin, rxUp, bodyTop - 11, 4, 4)
    const rxRest = waveLeft ? bodyX + bodyW : bodyX - 4
    px(ctx, palette.outline, rxRest, bodyTop + 2, 4, armLen)
    px(ctx, outfitColor, rxRest + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
  } else {
    const leftArmX = bodyX - 4 - Math.max(0, gait)
    const rightArmX = bodyX + bodyW + Math.max(0, -gait)
    px(ctx, palette.outline, leftArmX, bodyTop + 2, 4, armLen)
    px(ctx, outfitColor, leftArmX + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
    dot(ctx, palette.skin, leftArmX + 1, bodyTop + armLen)
    px(ctx, palette.outline, rightArmX, bodyTop + 2, 4, armLen)
    px(ctx, outfitColor, rightArmX + 1, bodyTop + 2, 2, armLen - 2, outfitShade)
    dot(ctx, palette.skin, rightArmX + 1, bodyTop + armLen)
  }

  // Legs
  const legShade = mixDark(palette.trousers)
  if (sitting) {
    px(ctx, palette.outline, bodyX, 30, Math.floor(bodyW / 2) - 1, 5)
    px(ctx, palette.trousers, bodyX + 1, 31, Math.floor(bodyW / 2) - 2, 4, legShade)
    px(ctx, palette.outline, bodyX + Math.floor(bodyW / 2) + 1, 30, Math.floor(bodyW / 2) - 1, 5)
    px(ctx, palette.trousers, bodyX + Math.floor(bodyW / 2) + 2, 31, Math.floor(bodyW / 2) - 2, 4, legShade)
    const sc = footwear === 'boots' ? palette.boots : palette.shoes
    px(ctx, palette.outline, bodyX - 1, 34, 7, 4)
    px(ctx, sc, bodyX, 35, 5, 3)
    px(ctx, palette.outline, bodyX + bodyW - 6, 34, 7, 4)
    px(ctx, sc, bodyX + bodyW - 5, 35, 5, 3)
  } else {
    const lLegY = 29 + Math.max(0, gait)
    const rLegY = 29 + Math.max(0, -gait)
    const legW = 5 + Math.floor(bw / 2)
    px(ctx, palette.outline, bodyX + 1, lLegY, legW, 6)
    px(ctx, palette.trousers, bodyX + 2, lLegY + 1, legW - 2, 5, legShade)
    px(ctx, palette.outline, bodyX + bodyW - legW - 1, rLegY, legW, 6)
    px(ctx, palette.trousers, bodyX + bodyW - legW, rLegY + 1, legW - 2, 5, legShade)
    const shoeColor = footwear === 'boots' ? palette.boots : palette.shoes
    const shoeShade = mixDark(shoeColor)
    const lShoeX = bodyX + Math.max(0, -gait)
    const rShoeX = bodyX + bodyW - 7 + Math.max(0, gait)
    px(ctx, palette.outline, lShoeX, 34, 7, 4)
    px(ctx, shoeColor, lShoeX + 1, 35, 5, 3, shoeShade)
    px(ctx, palette.outline, rShoeX, 34, 7, 4)
    px(ctx, shoeColor, rShoeX + 1, 35, 5, 3, shoeShade)
    if (footwear === 'boots') {
      dot(ctx, lighten(palette.boots, 0x18), lShoeX + 1, 34)
      dot(ctx, lighten(palette.boots, 0x18), rShoeX + 1, 34)
    }
  }

  dot(ctx, palette.outline, bodyX + 1, bodyTop + 12)
  dot(ctx, palette.outline, bodyX + 3, bodyTop + 12)
}

// ─── Character canvas block ───────────────────────────────────────────────────

type CharacterBlockProps = {
  cfg: CharacterConfig
  appearance: Appearance
  animFrame: number
}

function CharacterBlock({ cfg, appearance, animFrame }: CharacterBlockProps) {
  const poses: Pose[] = ['idle', 'walk', 'wave', 'sit', 'sleep']
  const dirs: Dir[]   = ['down', 'left', 'right', 'up']
  const frameCounts: Record<Pose, number> = { idle: 2, walk: 6, wave: 1, sit: 1, sleep: 1 }

  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    let col = 0
    for (const pose of poses) {
      const frames = frameCounts[pose]
      for (const dir of dirs) {
        // Which frame to show in animation (cycle through available frames)
        const f = animFrame % frames
        const xOff = col * (FRAME_W + 2)
        const yOff = dirs.indexOf(dir) * (FRAME_H + 2)

        // Clear cell
        ctx.clearRect(xOff, yOff, FRAME_W, FRAME_H)

        // Save/restore so drawFrame doesn't bleed
        ctx.save()
        ctx.translate(xOff, yOff)
        drawFrame(ctx, cfg, appearance, pose, dir, f)
        ctx.restore()
      }
      col++
    }
  }, [cfg, appearance, animFrame])

  const totalCols = poses.length
  const totalRows = dirs.length
  const canvasW = totalCols * (FRAME_W + 2) * SCALE
  const canvasH = totalRows * (FRAME_H + 2) * SCALE

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ color: '#e9bd68', fontFamily: 'monospace', fontSize: 14, marginBottom: 6 }}>
        {cfg.name} — {poses.map((p, i) => (
          <span key={p} style={{ marginRight: 8, opacity: 0.7 }}>
            {i + 1}. {p} ({frameCounts[p]}f)
          </span>
        ))}
      </div>
      <canvas
        ref={canvasRef}
        width={totalCols * (FRAME_W + 2)}
        height={totalRows * (FRAME_H + 2)}
        style={{
          width: canvasW,
          height: canvasH,
          imageRendering: 'pixelated',
          border: '1px solid #354a5c',
          background: '#263747',
        }}
      />
    </div>
  )
}

// ─── Palette swatch ───────────────────────────────────────────────────────────

const SWATCH_COLORS: [string, number][] = [
  ['midnight deep', 0x192d39], ['midnight', 0x263747], ['midnight light', 0x354a5c], ['midnight high', 0x4a6278],
  ['sage shadow', 0x5a6e5a],   ['sage', 0x789078],     ['sage light', 0x96a896],     ['sage high', 0xb4c4b4],
  ['cream shadow', 0xc8b898],  ['cream', 0xe8dcc5],    ['cream light', 0xf4eedd],    ['cream high', 0xfffbf0],
  ['terra shadow', 0x9b5d50],  ['terra', 0xc98575],    ['terra light', 0xd9a08c],    ['terra high', 0xeabca8],
  ['gold shadow', 0xb8924a],   ['gold', 0xe9bd68],     ['gold light', 0xf4d088],     ['gold high', 0xfce8b0],
  ['outline', 0x192d39],
]

function PaletteSwatches() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
      {SWATCH_COLORS.map(([name, hex]) => (
        <div key={name} title={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: 28, height: 28,
            background: '#' + hex.toString(16).padStart(6, '0'),
            border: '1px solid #354a5c',
          }} />
          <span style={{ fontSize: 8, color: '#96a896', fontFamily: 'monospace', maxWidth: 34, textAlign: 'center', lineHeight: 1.2 }}>
            {name}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Main preview page ────────────────────────────────────────────────────────

export default function ArtPreview() {
  const animFrame = useAnimFrame(120)

  return (
    <div style={{
      background: '#192d39',
      minHeight: '100vh',
      padding: '24px 20px',
      boxSizing: 'border-box',
    }}>
      <h1 style={{
        color: '#e9bd68',
        fontFamily: 'monospace',
        fontSize: 20,
        marginBottom: 4,
        letterSpacing: 1,
      }}>
        🎨 Art Preview — A Tiny World for Two
      </h1>
      <p style={{ color: '#96a896', fontFamily: 'monospace', fontSize: 11, marginBottom: 20 }}>
        ?art=1 · No login · Columns = pose frames cycling · Rows = directions (down, left, right, up) · Scale {SCALE}×
      </p>

      <h2 style={{ color: '#b4c4b4', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>Palette</h2>
      <PaletteSwatches />

      <h2 style={{ color: '#b4c4b4', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>Characters</h2>
      {(Object.values(characters) as CharacterConfig[]).map(cfg => (
        <CharacterBlock
          key={cfg.id}
          cfg={cfg}
          appearance={cfg.defaultAppearance}
          animFrame={animFrame}
        />
      ))}

      <h2 style={{ color: '#b4c4b4', fontFamily: 'monospace', fontSize: 13, marginBottom: 12 }}>Pond fish and fishing</h2>
      <PondFishPreview />
      <FishingArtPreview />

      <p style={{ color: '#5a6e5a', fontFamily: 'monospace', fontSize: 10, marginTop: 20 }}>
        Task G2 props and tiles will appear here once added.
      </p>
    </div>
  )
}

function PondFishPreview() {
  return <div style={{ width: 'min(620px, 100%)', marginBottom: 24, padding: 10, border: '1px solid #526c6b', borderRadius: 8, background: '#243b48' }}>
    <svg viewBox="0 0 560 130" role="img" aria-label="Eight small pond fish in four palette colors, with ripples">
      <ellipse cx="280" cy="69" rx="270" ry="55" fill="#63959a" stroke="#627d65" strokeWidth="12" />
      <path d="M38 45h75m300 15h65m-350 28h52" stroke="#a9c4b1" strokeWidth="3" opacity=".65" />
      {Array.from({ length: 8 }, (_, index) => {
        const fish = FISH_CATALOG[index % FISH_CATALOG.length]
        const x = 48 + index * 66
        const y = index % 2 === 0 ? 62 : 83
        return <g key={`${fish.id}-${index}`} transform={`translate(${x} ${y})`}>
          <ellipse cx="3" cy="18" rx="19" ry="4" fill="none" stroke="#c0d6c1" strokeWidth="2" opacity=".6" />
          <path d="M0 10  -10 3 -9 17z" fill={`#${fish.color.toString(16).padStart(6, '0')}`} stroke="#263747" strokeWidth="2" />
          <ellipse cx="8" cy="10" rx="16" ry="9" fill={`#${fish.color.toString(16).padStart(6, '0')}`} stroke="#263747" strokeWidth="2" />
          <circle cx="17" cy="7" r="1.5" fill="#263747" />
        </g>
      })}
    </svg>
    <p style={{ margin: '7px 2px 0', color: '#b4c4b4', fontFamily: 'monospace', fontSize: 10 }}>Six named fish; four shared palette colors. The island pond renders eight fish.</p>
  </div>
}

function FishingArtPreview() {
  const firstFish = FISH_CATALOG[1]
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, width: 'min(620px, 100%)', marginBottom: 24, padding: 10, border: '1px solid #526c6b', borderRadius: 8, background: '#243b48' }}>
    <svg viewBox="0 0 230 84" role="img" aria-label="Fishing rod, curved line, bobber and ripple">
      <rect width="230" height="84" rx="7" fill="#63959a" />
      <path d="M15 64Q34 55 41 12" fill="none" stroke="#765b4b" strokeWidth="6" strokeLinecap="round" />
      <path d="M41 12Q120 12 170 63" fill="none" stroke="#e8dcc5" strokeWidth="2" strokeDasharray="4 3" />
      <ellipse cx="170" cy="71" rx="22" ry="5" fill="none" stroke="#c0d6c1" strokeWidth="2" />
      <circle cx="170" cy="62" r="6" fill="#e9bd68" stroke="#263747" strokeWidth="2" />
      <path d="M162 58l-6-8m14 8 6-9m-6 10 1-11" stroke="#f6efdf" strokeWidth="2" />
    </svg>
    <div style={{ width: 150, padding: '10px 12px', border: '1px solid #ae955f', borderRadius: 7, background: '#f4eddb', color: '#344755', fontFamily: 'monospace', fontSize: 10 }}>
      <strong style={{ display: 'block', marginBottom: 6 }}>A small catch</strong>
      <svg viewBox="0 0 48 28" role="img" aria-label={`${firstFish.name} sample card`}>
        <path d="M4 14 0 5l11 5c8-8 22-8 30 4-8 12-22 12-30 4L0 23z" fill={`#${firstFish.color.toString(16).padStart(6, '0')}`} stroke="#263747" strokeWidth="2" />
        <circle cx="33" cy="12" r="1.7" fill="#263747" />
      </svg>
      <span style={{ display: 'block', marginTop: 3 }}>{firstFish.name} · release gently</span>
    </div>
  </div>
}

// ─── Hook: increments frame counter at given ms interval ─────────────────────

function useAnimFrame(intervalMs: number): number {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setFrame(f => f + 1), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return frame
}
