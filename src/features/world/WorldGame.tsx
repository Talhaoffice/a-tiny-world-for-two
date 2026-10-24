import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type Phaser from 'phaser'
import { Button } from '../../components/Button'
import { realtimeDatabase } from '../../lib/firebase'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { ConnectionBanner, DiagnosticsPanel } from '../../components/DiagnosticsPanel'
import { logError } from '../../lib/logger'
import { loadCharacterRoster, type CharacterRoster } from './characterRoster'
import { IntroExperience } from './IntroExperience'
import type { IntroMode } from './introFlow'
import { DestinationPanel, type Destination } from '../destinations/DestinationPanel'
import { connectWorldSync, type ConnectionState } from './worldSync'
import { loadTutorialProgress, recordTutorialCompletion, recordWelcomeRead } from './tutorialProgress'
import { TutorialGuide } from './TutorialGuide'
import type { Direction, IslandPlace, IslandScene, RemotePlayerPosition } from './IslandScene'
import './world.css'

type Props = { uid: string; onBack: () => void }

export function WorldGame({ uid, onBack }: Props) {
  const gameHost = useRef<HTMLDivElement>(null)
  const game = useRef<Phaser.Game | null>(null)
  const scene = useRef<IslandScene | null>(null)
  const sync = useRef<ReturnType<typeof connectWorldSync> | null>(null)
  const destinationOpen = useRef(false)
  const [nearby, setNearby] = useState<IslandPlace | null>(null)
  const [notice, setNotice] = useState('Loading your character and the island roster…')
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [destination, setDestination] = useState<Destination | null>(null)
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [progressReady, setProgressReady] = useState(false)
  const [welcomeHasBeenRead, setWelcomeHasBeenRead] = useState(false)
  const [roster, setRoster] = useState<CharacterRoster | null>(null)
  const [introMode, setIntroMode] = useState<IntroMode | null>(null)

  useEffect(() => {
    let active = true
    setProgressReady(false)
    setWelcomeHasBeenRead(false)
    void loadTutorialProgress().then(progress => {
      if (!active) return
      setWelcomeHasBeenRead(progress?.welcomeReadAt !== null && progress?.welcomeReadAt !== undefined)
      setProgressReady(true)
    }).catch(error => {
      // Progress is optional; a failed read must not be mistaken for a new player.
      logError(error, 'firestore/tutorial-progress')
      if (active) setProgressReady(false)
    })
    return () => { active = false }
  }, [uid])

  useEffect(() => {
    destinationOpen.current = destination !== null
    scene.current?.setDestinationOpen(destinationOpen.current)
  }, [destination])

  useEffect(() => {
    let disposed = false
    setRoster(null)
    setIntroMode(null)
    const parent = gameHost.current
    if (!parent) return
    const database = realtimeDatabase
    const releaseTouchPointers = () => scene.current?.releaseTouchPointers()
    window.addEventListener('blur', releaseTouchPointers)
    if (!database) {
      setConnectionState('error')
      setNotice('The island connection is not configured.')
      return () => window.removeEventListener('blur', releaseTouchPointers)
    }

    let worldSync: ReturnType<typeof connectWorldSync> | null = null
    void loadCharacterRoster(uid).then(async roster => {
      if (disposed) return
      setRoster(roster)
      if (roster.local.config.id === 'mannu' && !roster.introCompleted) setIntroMode('first-entry')
      worldSync = connectWorldSync(
        database,
        uid,
        roster.remoteUid,
        (position: RemotePlayerPosition | null) => scene.current?.setRemotePosition(position),
        setConnectionState,
      )
      sync.current = worldSync
      const [{ default: PhaserRuntime }, { IslandScene: Scene }] = await Promise.all([import('phaser'), import('./IslandScene')])
      if (disposed || !gameHost.current || !worldSync) return
      const island = new Scene(
        setNearby,
        place => {
          setNotice(`You explore the ${place.label.toLowerCase()}. ${place.detail}`)
          setDestination(place.id)
        },
        (x, y, time) => worldSync?.publishPosition(x, y, time),
        roster,
      )
      island.setDestinationOpen(destinationOpen.current)
      scene.current = island
      game.current = new PhaserRuntime.Game({
        type: PhaserRuntime.AUTO,
        parent,
        backgroundColor: '#294657',
        pixelArt: true,
        roundPixels: true,
        scale: {
          mode: PhaserRuntime.Scale.RESIZE,
          width: 960,
          height: 600,
        },
        physics: {
          default: 'arcade',
          arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene: [island],
      })
      setNotice('Wander along the paths and look for the gold E markers.')
    }).catch(error => {
      logError(error, 'game/character-setup')
      if (!disposed) {
        setConnectionState('error')
        setNotice('The island could not load. Check the two active member records and the character mapping in world/main.')
      }
    })

    return () => {
      disposed = true
      window.removeEventListener('blur', releaseTouchPointers)
      void worldSync?.stop()
      sync.current = null
      game.current?.destroy(true)
      game.current = null
      scene.current = null
    }
  }, [uid])

  function beginTouch(event: PointerEvent<HTMLButtonElement>, direction: Direction) {
    event.currentTarget.setPointerCapture(event.pointerId)
    scene.current?.setTouchPointer(event.pointerId, direction)
  }

  function endTouch(event: PointerEvent<HTMLButtonElement>) {
    scene.current?.releaseTouchPointer(event.pointerId)
  }

  async function leaveWorld() {
    await sync.current?.stop()
    sync.current = null
    onBack()
  }

  function handleWelcomeRead() {
    setWelcomeHasBeenRead(true)
    void recordWelcomeRead().catch(error => {
      logError(error, 'firestore/welcome-progress')
      setNotice('The letter is yours to read. We could not save that progress, but you can keep exploring.')
    })
  }

  function startTutorial() {
    setDestination(null)
    setTutorialStep(0)
  }

  function finishTutorial() {
    setTutorialStep(null)
    void recordTutorialCompletion().catch(error => {
      logError(error, 'firestore/tutorial-progress')
      setNotice('You finished the tour. We could not save its completion, but the island is still yours to explore.')
    })
  }

  const tutorialGuide = tutorialStep === null ? null : <TutorialGuide
    step={tutorialStep}
    nearby={nearby}
    destination={destination}
    inline={destination !== null}
    onBack={() => setTutorialStep(current => current === null ? null : Math.max(current - 1, 0))}
    onNext={() => setTutorialStep(current => current === null ? null : Math.min(current + 1, 3))}
    onSkip={() => setTutorialStep(null)}
    onFinish={finishTutorial}
  />

  return (
    <main className={`world-page${destination ? ' world-page--destination' : ''}`}>
      <header className="world-header">
        <Button variant="quiet" className="world-back" onClick={() => { void leaveWorld() }}><span aria-hidden="true">←</span> Back</Button>
        <div>
          <p className="eyebrow">A little place to wander</p>
          <h1>Our little island</h1>
        </div>
      </header>
      <div className="world-tools">
        <ConnectionBanner state={connectionState} />
        <DiagnosticsPanel />
      </div>
      <section className="world-layout" aria-label="Island game">
        <div className="game-frame">
          <ErrorBoundary title="Island scene paused">
            <div ref={gameHost} className="game-host" aria-label="Island game. Use WASD or arrow keys to walk, and E to explore nearby places." />
          </ErrorBoundary>
          <div className="game-hint" aria-live="polite">
            {nearby ? <><strong>Nearby: {nearby.label}</strong><span>Press E to explore</span></> : <span>Wander around the island and find the gold E markers.</span>}
            {nearby && <button type="button" className="inspect-button" onClick={() => scene.current?.inspectNearbyPlace()}>Explore {nearby.label}</button>}
          </div>
        </div>
        <aside className="game-sidebar">
          <div className="world-note" role="status" aria-live="polite">
            <span className="world-note__icon" aria-hidden="true">✦</span>
            <p>{notice}</p>
          </div>
          <div className="controls-card">
            <h2>Take a walk</h2>
            <p><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> or <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> to move</p>
            <p><kbd>E</kbd> to explore a nearby place</p>
            <button type="button" className="replay-tutorial" onClick={startTutorial}>Replay tutorial</button>
            <div className="intro-menu" aria-label="First-entry letter">
              <button type="button" onClick={() => setIntroMode('read')}>Read the first-entry letter</button>
              {roster?.local.config.id === 'talha' && <>
                <button type="button" onClick={() => setIntroMode('preview')}>Preview Mannu’s intro</button>
                <button type="button" onClick={() => setIntroMode('edit')}>Edit the first-entry letter</button>
              </>}
            </div>
            <div className="touch-pad" aria-label="Touch movement controls">
              <button type="button" aria-label="Move up" onPointerDown={event => beginTouch(event, 'up')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>↑</button>
              <button type="button" aria-label="Move left" onPointerDown={event => beginTouch(event, 'left')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>←</button>
              <button type="button" aria-label="Move down" onPointerDown={event => beginTouch(event, 'down')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>↓</button>
              <button type="button" aria-label="Move right" onPointerDown={event => beginTouch(event, 'right')} onPointerUp={endTouch} onPointerCancel={endTouch} onLostPointerCapture={endTouch}>→</button>
            </div>
            <button type="button" className="touch-explore" disabled={!nearby} onClick={() => scene.current?.inspectNearbyPlace()}>Explore nearby place</button>
          </div>
        </aside>
      </section>
      <footer className="world-footer">A small world, made of pixels <span aria-hidden="true">✦</span></footer>
      {destination && <DestinationPanel
        uid={uid}
        active={destination}
        onClose={() => setDestination(null)}
        onNavigate={setDestination}
        showWelcomeOnFirstVisit={progressReady && !welcomeHasBeenRead}
        welcomeHasBeenRead={welcomeHasBeenRead}
        onWelcomeRead={handleWelcomeRead}
        onStartTutorial={startTutorial}
        tutorialGuide={tutorialGuide}
      />}
      {destination === null && tutorialGuide}
      {introMode && roster && <IntroExperience
        uid={uid}
        talhaUid={roster.talhaUid}
        mode={introMode}
        onClose={() => setIntroMode(null)}
        onComplete={() => { setIntroMode(null); startTutorial() }}
      />}
    </main>
  )
}
