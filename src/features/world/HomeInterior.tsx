import { useEffect, useRef, useState } from 'react'
import type { CharacterId } from './characters.config'
import type { RemotePosition } from './worldSync'
import './homeInterior.css'

export type HomePanelFocus = 'notes' | 'keepsakes' | 'garden'
export type RoomPosition = { x: number; y: number }

type Props = {
  localCharacter: CharacterId
  remoteCharacter: CharacterId
  localPosition: RoomPosition
  remotePosition: RemotePosition | null
  onMove: (x: number, y: number) => void
  onOpenPanel: (focus: HomePanelFocus) => void
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

export function HomeInterior({ localCharacter, remoteCharacter, localPosition, remotePosition, onMove, onOpenPanel, onExit }: Props) {
  const [look, setLook] = useState('')
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const room = useRef<HTMLDivElement>(null)
  const positionRef = useRef(localPosition)
  const onMoveRef = useRef(onMove)
  const onExitRef = useRef(onExit)
  const leaveTimer = useRef<number | null>(null)
  positionRef.current = localPosition
  onMoveRef.current = onMove
  onExitRef.current = onExit

  useEffect(() => {
    room.current?.focus({ preventScroll: true })
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!leavingRef.current) {
          leavingRef.current = true
          setLeaving(true)
          leaveTimer.current = window.setTimeout(() => onExitRef.current(), 260)
        }
        return
      }
      const step = KEY_STEPS[event.key.toLowerCase()]
      if (!step || leavingRef.current) return
      event.preventDefault()
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
    leavingRef.current = true
    setLeaving(true)
    leaveTimer.current = window.setTimeout(() => onExitRef.current(), 260)
  }

  const remote = remotePosition ? { x: remotePosition.x, y: remotePosition.y } : null

  return (
    <section className={`home-interior${leaving ? ' home-interior--leaving' : ''}`} aria-label="Our Home interior">
      <header className="home-interior__header">
        <div><p className="eyebrow">Inside the cottage</p><h1>Our Home</h1></div>
        <div className="home-interior__presence" role="status">{remote ? 'Your person is here too' : 'You can explore this room while your person is elsewhere'}</div>
        <button type="button" className="home-interior__back" onClick={leaveRoom}><span aria-hidden="true">↶</span> Back to island</button>
      </header>
      <div ref={room} className="home-room" tabIndex={0} aria-label="Walk around with WASD or arrow keys. Choose a furniture marker to open its island panel.">
        <div className="home-room__window" aria-hidden="true"><i /><i /><i /><i /></div>
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
        {look && <p className="home-room__caption" role="status">{look}<button type="button" onClick={() => setLook('')} aria-label="Dismiss room detail">×</button></p>}
        <div className="home-interior__avatars" aria-label="Players in the room">
          {remote && <HomeAvatar character={remoteCharacter} name={remoteCharacter === 'talha' ? 'Talha' : 'Mannu'} position={remote} />}
          <HomeAvatar character={localCharacter} name={localCharacter === 'talha' ? 'Talha' : 'Mannu'} position={localPosition} />
        </div>
        <button type="button" className="home-door" onClick={leaveRoom} aria-label="Leave the cottage"><span>Door</span></button>
      </div>
      <p className="home-interior__hint"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or arrow keys to walk · Choose a room marker to open a panel · <kbd>Esc</kbd> to leave</p>
    </section>
  )
}

function HomeAvatar({ character, name, position }: { character: CharacterId; name: string; position: RoomPosition }) {
  return <div className="home-avatar" role="img" data-character={character} style={avatarStyle(position)} aria-label={`${name} is inside Our Home`}>
    <span className="home-avatar__hair" /><span className="home-avatar__body" /><span className="home-avatar__feet" /><span className="home-avatar__name">{name}</span>
  </div>
}
