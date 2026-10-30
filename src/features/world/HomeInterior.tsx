import { useEffect, useRef, useState } from 'react'
import type { CharacterId } from './characters.config'
import type { RemotePosition } from './worldSync'
import { areBothAsleep, isNearBed, sleepPosition, type RoomPosition } from './homeSleep'
import { logError } from '../../lib/logger'
import './homeInterior.css'

export type { RoomPosition } from './homeSleep'

export type HomePanelFocus = 'notes' | 'keepsakes' | 'garden'

type Props = {
  localCharacter: CharacterId
  remoteCharacter: CharacterId
  localPosition: RoomPosition
  remotePosition: RemotePosition | null
  onMove: (x: number, y: number) => void
  onOpenPanel: (focus: HomePanelFocus) => void
  onOpenWardrobe?: () => void
  localSleeping: boolean
  lowPower: boolean
  sleepSprites: Partial<Record<CharacterId, string>>
  onSleepChange: (sleeping: boolean, position: RoomPosition) => void
  /** Task C hook: restore this player's health when sleep begins. */
  onSleepRestoreHealth?: () => void
  onExit: () => void
}

const MIN_X = 340
const MAX_X = 1196
const MIN_Y = 290
const MAX_Y = 870
const KEY_STEPS: Record<string, [number, number]> = {
  arrowup: [0, -34], w: [0, -34],
  arrowdown: [0, 34], s: [0, 34],
  arrowleft: [-34, 0], a: [-34, 0],
  arrowright: [34, 0], d: [34, 0],
}

function avatarStyle(position: RoomPosition) {
  return {
    left: `${Math.max(0, Math.min(100, (position.x - MIN_X) / (MAX_X - MIN_X) * 100))}%`,
    top: `${Math.max(0, Math.min(100, (position.y - MIN_Y) / (MAX_Y - MIN_Y) * 100))}%`,
  }
}

export function HomeInterior({ localCharacter, remoteCharacter, localPosition, remotePosition, onMove, onOpenPanel, onOpenWardrobe, localSleeping, lowPower, sleepSprites, onSleepChange, onSleepRestoreHealth, onExit }: Props) {
  const [look, setLook] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [lullabyMuted, setLullabyMuted] = useState(false)
  const [lullabyUnavailable, setLullabyUnavailable] = useState(false)
  const [lullabyUnlocked, setLullabyUnlocked] = useState(false)
  const leavingRef = useRef(false)
  const localSleepingRef = useRef(localSleeping)
  const onSleepChangeRef = useRef(onSleepChange)
  const onSleepRestoreHealthRef = useRef(onSleepRestoreHealth)
  const room = useRef<HTMLDivElement>(null)
  const positionRef = useRef(localPosition)
  const onMoveRef = useRef(onMove)
  const onExitRef = useRef(onExit)
  const audioContext = useRef<AudioContext | null>(null)
  const leaveTimer = useRef<number | null>(null)
  positionRef.current = localPosition
  localSleepingRef.current = localSleeping
  onSleepChangeRef.current = onSleepChange
  onSleepRestoreHealthRef.current = onSleepRestoreHealth
  onMoveRef.current = onMove
  onExitRef.current = onExit
  const remote = remotePosition ? { x: remotePosition.x, y: remotePosition.y } : null
  const bothAsleep = areBothAsleep(localSleeping, remotePosition?.anim)

  function unlockLullabyAudio() {
    try {
      const Context = window.AudioContext
      if (!Context) { setLullabyUnavailable(true); return }
      const context = audioContext.current ?? new Context()
      audioContext.current = context
      void context.resume().then(() => setLullabyUnlocked(true)).catch(error => {
        setLullabyUnavailable(true)
        logError(error, 'audio/home-lullaby-resume')
      })
    } catch (error) {
      setLullabyUnavailable(true)
      logError(error, 'audio/home-lullaby')
    }
  }

  function setSleeping(sleeping: boolean) {
    if (sleeping === localSleepingRef.current) return
    if (sleeping) {
      unlockLullabyAudio()
      const next = sleepPosition(localCharacter)
      positionRef.current = next
      onMoveRef.current(next.x, next.y)
      try { onSleepRestoreHealthRef.current?.() }
      catch (error) { logError(error, 'home/sleep-health-hook') }
    }
    localSleepingRef.current = sleeping
    onSleepChangeRef.current(sleeping, positionRef.current)
  }

  useEffect(() => {
    if (!bothAsleep || lullabyMuted || !lullabyUnlocked) return
    const context = audioContext.current
    if (!context || context.state !== 'running') return
    let index = 0
    let oscillator: OscillatorNode | null = null
    let gain: GainNode | null = null
    const playNote = () => {
      try {
        if (oscillator) { try { oscillator.stop() } catch { /* already stopped */ }; oscillator.disconnect() }
        if (gain) gain.disconnect()
        const now = context.currentTime
        const frequencies = [196, 220, 261.63, 220]
        oscillator = context.createOscillator()
        gain = context.createGain()
        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequencies[index % frequencies.length], now)
        gain.gain.setValueAtTime(0.0001, now)
        gain.gain.exponentialRampToValueAtTime(0.006, now + 0.2)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
        oscillator.connect(gain)
        gain.connect(context.destination)
        oscillator.start(now)
        oscillator.stop(now + 1.15)
        index += 1
      } catch (error) { logError(error, 'audio/home-lullaby-note') }
    }
    playNote()
    const timer = window.setInterval(playNote, 1200)
    return () => {
      window.clearInterval(timer)
      if (oscillator) { try { oscillator.stop() } catch { /* already stopped */ }; oscillator.disconnect() }
      gain?.disconnect()
    }
  }, [bothAsleep, lullabyMuted, lullabyUnlocked])

  useEffect(() => () => {
    const context = audioContext.current
    audioContext.current = null
    if (context && context.state !== 'closed') void context.close().catch(error => logError(error, 'audio/home-lullaby-close'))
  }, [])

  useEffect(() => {
    room.current?.focus({ preventScroll: true })
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (localSleepingRef.current) setSleeping(false)
        if (!leavingRef.current) {
          leavingRef.current = true
          setLeaving(true)
          leaveTimer.current = window.setTimeout(() => onExitRef.current(), 260)
        }
        return
      }
      if (event.key.toLowerCase() === 'e' && isNearBed(positionRef.current) && !leavingRef.current) {
        event.preventDefault()
        setSleeping(!localSleepingRef.current)
        return
      }
      const step = KEY_STEPS[event.key.toLowerCase()]
      if (!step || leavingRef.current) return
      event.preventDefault()
      if (localSleepingRef.current) setSleeping(false)
      const next = {
        x: Math.max(MIN_X, Math.min(MAX_X, positionRef.current.x + step[0])),
        y: Math.max(MIN_Y, Math.min(MAX_Y, positionRef.current.y + step[1])),
      }
      positionRef.current = next
      onMoveRef.current(next.x, next.y)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    }
  }, [])

  function leaveRoom() {
    if (leavingRef.current) return
    if (localSleepingRef.current) setSleeping(false)
    leavingRef.current = true
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => onExitRef.current(), 260)
  }

  const bedNearby = isNearBed(localPosition)

  return (
    <section className={`home-interior${leaving ? ' home-interior--leaving' : ''}`} data-low-power={lowPower} aria-label="Our Home interior">
      <header className="home-interior__header">
        <div><p className="eyebrow">Inside the cottage</p><h1>Our Home</h1></div>
        <div className="home-interior__presence" role="status">{remote ? 'Your person is here too' : 'You can explore this room while your person is elsewhere'}</div>
        <button type="button" className="home-interior__back" onClick={leaveRoom}><span aria-hidden="true">↶</span> Back to island</button>
      </header>
      <div ref={room} className={`home-room${bothAsleep ? ' home-room--both-asleep' : ''}`} tabIndex={0} aria-label="Walk around with WASD or arrow keys. Choose a furniture marker to open its island panel.">
        <div className="home-room__window" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="home-bed" aria-label="Double bed with two pillows and a shared blanket">
          <span className="home-bed__headboard" /><span className="home-bed__mattress" />
          <span className="home-bed__pillow home-bed__pillow--left" /><span className="home-bed__pillow home-bed__pillow--right" />
          <span className="home-bed__blanket" /><span className="home-bed__label">Rest</span>
        </div>
        <div className="home-room__sleep-effects" aria-hidden={!bothAsleep}><span>z</span><span>z</span><span>z</span></div>
        {bothAsleep && <div className="home-room__night-overlay" aria-hidden="true" />}
        {bothAsleep && <button type="button" className="home-room__mute" onClick={() => setLullabyMuted(muted => !muted)} aria-pressed={lullabyMuted}>{lullabyMuted ? 'Unmute lullaby' : 'Mute lullaby'}</button>}
        {bothAsleep && lullabyUnavailable && <span className="home-room__audio-note" role="status">Lullaby audio is unavailable here.</span>}
        <div className="home-room__wall-clock" aria-hidden="true">✦</div>
        <div className="home-furniture home-furniture--bookcase" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <div className="home-furniture home-furniture--table" aria-hidden="true"><i /></div>
        <div className="home-furniture home-furniture--lamp" aria-hidden="true"><i /></div>
        <div className="home-furniture home-furniture--plant home-furniture--plant-one" aria-hidden="true">✿</div>
        <div className="home-furniture home-furniture--plant home-furniture--plant-two" aria-hidden="true">✿</div>
        <button className="home-hotspot home-hotspot--books" type="button" onClick={() => setLook('A small bookshelf sits along the wall.')} aria-label="Look at the bookshelf">Bookshelf</button>
        <button className="home-hotspot home-hotspot--table" type="button" onClick={() => setLook('A table rests beside the window.')} aria-label="Look at the table">Table</button>
        <button className="home-hotspot home-hotspot--lamp" type="button" onClick={() => setLook('A warm lamp glows beside the table.')} aria-label="Look at the lamp">Lamp</button>
        <button className="home-hotspot home-hotspot--plants" type="button" onClick={() => onOpenPanel('garden')} aria-label="Open the memory garden from the plants">Plants · Memory Garden</button>
        <button className="home-hotspot home-hotspot--wall" type="button" onClick={() => onOpenPanel('garden')} aria-label="Open the memory garden">Memory wall</button>
        <button className="home-hotspot home-hotspot--shelf" type="button" onClick={() => onOpenPanel('keepsakes')} aria-label="Open shared keepsakes">Keepsake shelf</button>
        <button className="home-hotspot home-hotspot--board" type="button" onClick={() => onOpenPanel('notes')} aria-label="Open shared notes">Note board</button>
        <button className="home-hotspot home-hotspot--mirror" type="button" onClick={onOpenWardrobe} aria-label="Look in the mirror to change your wardrobe">Mirror · Wardrobe</button>
        {look && <p className="home-room__caption" role="status">{look}<button type="button" onClick={() => setLook('')} aria-label="Dismiss room detail">×</button></p>}
        <div className="home-interior__avatars" aria-label="Players in the room">
          {remote && <HomeAvatar character={remoteCharacter} name={remoteCharacter === 'talha' ? 'Talha' : 'Mannu'} position={remotePosition?.anim === 'sleep' ? sleepPosition(remoteCharacter) : remote} sleeping={remotePosition?.anim === 'sleep'} sleepSpriteUrl={sleepSprites[remoteCharacter]} />}
          <HomeAvatar character={localCharacter} name={localCharacter === 'talha' ? 'Talha' : 'Mannu'} position={localPosition} sleeping={localSleeping} sleepSpriteUrl={sleepSprites[localCharacter]} />
        </div>
        <button type="button" className={`home-bed-prompt${bedNearby ? ' home-bed-prompt--nearby' : ''}`} onClick={() => setSleeping(!localSleeping)} aria-label={localSleeping ? 'Wake up' : 'Sleep'}>
          <span className="home-bed-prompt__desktop"><kbd>E</kbd> {localSleeping ? 'Wake' : 'Sleep'}</span>
          <span className="home-bed-prompt__mobile">Tap to {localSleeping ? 'wake' : 'sleep'}</span>
        </button>
        <button type="button" className="home-door" onClick={leaveRoom} aria-label="Leave the cottage"><span>Door</span></button>
      </div>
      <p className="home-interior__hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to walk · Choose a room marker to open a panel · <kbd>Esc</kbd> to leave</p>
    </section>
  )
}

function HomeAvatar({ character, name, position, sleeping = false, sleepSpriteUrl }: { character: CharacterId; name: string; position: RoomPosition; sleeping?: boolean; sleepSpriteUrl?: string }) {
  return <div className={`home-avatar${sleeping ? ' home-avatar--sleeping' : ''}`} role="img" data-character={character} style={avatarStyle(position)} aria-label={`${name} is ${sleeping ? 'sleeping' : 'inside Our Home'}`}>
    {sleeping && sleepSpriteUrl ? <img className="home-avatar__sleep-sprite" src={sleepSpriteUrl} alt="" /> : <><span className="home-avatar__hair" /><span className="home-avatar__face" /><span className="home-avatar__body" /><span className="home-avatar__feet" />{sleeping && <span className="home-avatar__sleep-blanket" />}</>}<span className="home-avatar__name">{name}</span>
  </div>
}
