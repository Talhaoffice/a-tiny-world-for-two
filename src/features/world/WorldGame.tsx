import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
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
import { connectWorldSync, type ConnectionState, type RemotePosition } from './worldSync'
import { HomeInterior, type HomePanelFocus, type RoomPosition } from './HomeInterior'
import { loadTutorialProgress, recordTutorialCompletion, recordWelcomeRead } from './tutorialProgress'
import { TutorialGuide } from './TutorialGuide'
import type { AtmosphereSettings, Direction, IslandPlace, IslandScene } from './IslandScene'
import type { DayNightMode, DecorativeWeather } from './worldAtmosphere'
import { PersonalCornerPanel, type PersonalCornerId } from './PersonalCornerPanel'
import { AppearancePanel } from './AppearancePanel'
import type { GardenCornerEffects } from './gardenCornerEffects'
import type { CharacterAppearance } from './characters.config'
import type { MoodLanternColor } from './characterSprites'
import { canSendWorldEmote, type WorldEmoteType } from './worldEmotes'
import { EMPTY_ANNUAL_SPECIAL_DATES, isAnnualSpecialDateToday, type AnnualSpecialDates } from './annualSpecialDates'
import { loadAnnualSpecialDates } from './specialDatesContent'
import { SpecialDatesPanel } from './SpecialDatesPanel'
import { StargazingPanel } from './StargazingPanel'
import { DreamBoardPanel } from './DreamBoardPanel'
import './world.css'

type Props = { uid: string; onBack: () => void }
const HOME_SPAWN: RoomPosition = { x: 768, y: 820 }
const EMPTY_CORNER_EFFECTS: GardenCornerEffects = { lanternGlow: false, gardenFireflies: false, gardenGrowth: false }

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
  const [activeCorner, setActiveCorner] = useState<PersonalCornerId | null>(null)
  const [wardrobeOpen, setWardrobeOpen] = useState(false)
  const [specialDatesOpen, setSpecialDatesOpen] = useState(false)
  const [stargazingOpen, setStargazingOpen] = useState(false)
  const [dreamBoardOpen, setDreamBoardOpen] = useState(false)
  const [tutorialStep, setTutorialStep] = useState<number | null>(null)
  const [progressReady, setProgressReady] = useState(false)
  const [welcomeHasBeenRead, setWelcomeHasBeenRead] = useState(false)
  const [roster, setRoster] = useState<CharacterRoster | null>(null)
  const [cornerEffects, setCornerEffects] = useState<GardenCornerEffects>(EMPTY_CORNER_EFFECTS)
  const cornerEffectsRef = useRef(cornerEffects)
  const [specialDates, setSpecialDates] = useState<AnnualSpecialDates>(EMPTY_ANNUAL_SPECIAL_DATES)
  const [localDay, setLocalDay] = useState(() => new Date())
  const specialDateGlow = isAnnualSpecialDateToday(specialDates, localDay)
  const specialDateGlowRef = useRef(specialDateGlow)
  const [moodLantern, setMoodLantern] = useState<MoodLanternColor>('off')
  const moodLanternRef = useRef(moodLantern)
  const [momentMessage, setMomentMessage] = useState('')
  const [stargazingDates, setStargazingDates] = useState<string[]>([])
  const stargazingDatesRef = useRef(stargazingDates)
  const lastEmoteSentAt = useRef(Number.NEGATIVE_INFINITY)
  const [introMode, setIntroMode] = useState<IntroMode | null>(null)
  const [homeRoomOpen, setHomeRoomOpen] = useState(false)
  const [homeFocus, setHomeFocus] = useState<HomePanelFocus | null>(null)
  const [homePosition, setHomePosition] = useState<RoomPosition>(HOME_SPAWN)
  const [remotePosition, setRemotePosition] = useState<RemotePosition | null>(null)
  const [dayNight, setDayNight] = useState<DayNightMode>('auto')
  const [weather, setWeather] = useState<DecorativeWeather>('clear')
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  const [lowPower, setLowPower] = useState(() => (navigator.hardwareConcurrency || 8) <= 4)
  const [ambienceOn, setAmbienceOn] = useState(false)
  const [ambienceMessage, setAmbienceMessage] = useState('')
  const audioContext = useRef<AudioContext | null>(null)
  const atmosphereSettings = useRef<AtmosphereSettings>({ dayNight, weather, reducedMotion, lowPower })
  const worldModalOpen = destination !== null || homeRoomOpen || activeCorner !== null || wardrobeOpen || specialDatesOpen || stargazingOpen || dreamBoardOpen
  const handleCornerEffects = useCallback((effects: GardenCornerEffects) => setCornerEffects(effects), [])
  const handleSpecialDatesChange = useCallback((dates: AnnualSpecialDates) => setSpecialDates(dates), [])
  const handleStargazingDatesChange = useCallback((dates: string[]) => setStargazingDates(dates), [])

  useEffect(() => {
    cornerEffectsRef.current = cornerEffects
    scene.current?.setGardenEffects(cornerEffects)
  }, [cornerEffects])

  useEffect(() => {
    specialDateGlowRef.current = specialDateGlow
    scene.current?.setSpecialDateGlow(specialDateGlow)
  }, [specialDateGlow])

  useEffect(() => {
    moodLanternRef.current = moodLantern
  }, [moodLantern])

  useEffect(() => {
    stargazingDatesRef.current = stargazingDates
    scene.current?.setStargazingDates(stargazingDates)
  }, [stargazingDates])

  useEffect(() => {
    const settings = { dayNight, weather, reducedMotion, lowPower }
    atmosphereSettings.current = settings
    scene.current?.setAtmosphereSettings(settings)
  }, [dayNight, weather, reducedMotion, lowPower])

  useEffect(() => {
    const timer = window.setInterval(() => setLocalDay(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!preference) return
    const updatePreference = () => setReducedMotion(preference.matches)
    preference.addEventListener('change', updatePreference)
    return () => preference.removeEventListener('change', updatePreference)
  }, [])

  useEffect(() => () => {
    const context = audioContext.current
    audioContext.current = null
    if (context) void context.close()
  }, [])

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
    destinationOpen.current = destination !== null || homeRoomOpen || activeCorner !== null || wardrobeOpen || specialDatesOpen || stargazingOpen || dreamBoardOpen
    scene.current?.setDestinationOpen(destinationOpen.current)
  }, [destination, homeRoomOpen, activeCorner, wardrobeOpen, specialDatesOpen, stargazingOpen, dreamBoardOpen])

  useEffect(() => {
    let disposed = false
    setRoster(null)
    setIntroMode(null)
    setHomeRoomOpen(false)
    setHomeFocus(null)
    setActiveCorner(null)
    setWardrobeOpen(false)
    setSpecialDatesOpen(false)
    setStargazingOpen(false)
    setDreamBoardOpen(false)
    setStargazingDates([])
    setCornerEffects(EMPTY_CORNER_EFFECTS)
    setSpecialDates(EMPTY_ANNUAL_SPECIAL_DATES)
    setMoodLantern('off')
    setMomentMessage('')
    setRemotePosition(null)
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
      void loadAnnualSpecialDates().then(dates => {
        if (!disposed) setSpecialDates(dates)
      }).catch(error => logError(error, 'firestore/special-dates-load'))
      if (roster.local.config.id === 'mannu' && !roster.introCompleted) setIntroMode('first-entry')
      worldSync = connectWorldSync(
        database,
        uid,
        roster.remoteUid,
        (position: RemotePosition | null) => {
          setRemotePosition(position)
          scene.current?.setRemotePosition(position)
        },
        setConnectionState,
      )
      sync.current = worldSync
      worldSync.publishAppearance(roster.local.appearance)
      const [{ default: PhaserRuntime }, { IslandScene: Scene }] = await Promise.all([import('phaser'), import('./IslandScene')])
      if (disposed || !gameHost.current || !worldSync) return
      const island = new Scene(
        setNearby,
        place => {
          setNotice(`You explore the ${place.label.toLowerCase()}. ${place.detail}`)
          if (place.id === 'bench' || place.id === 'blanket') {
            sendWorldEmote(place.id === 'bench' ? 'sit-bench' : 'sit-blanket')
            setNotice(place.detail)
          } else if (place.id === 'pond-lantern') {
            const nextKind = scene.current?.isPondLanternLit() ? 'pond-lantern-off' : 'pond-lantern-on'
            sendWorldEmote(nextKind)
            setNotice(place.detail)
          } else if (place.id === 'stargazing') {
            setDestination(null)
            setStargazingOpen(true)
            setNotice(place.detail)
          } else if (place.id === 'dream-board') {
            setDestination(null)
            setDreamBoardOpen(true)
            setNotice(place.detail)
          } else if (place.id === 'home') enterHomeRoom()
          else if (place.id === 'lantern-post' || place.id === 'greenhouse') {
            setHomeRoomOpen(false)
            setDestination(null)
            setActiveCorner(place.id)
          } else { setHomeRoomOpen(false); setDestination(place.id) }
        },
        (x, y, time) => worldSync?.publishPosition(x, y, time),
        roster,
      )
      island.setAtmosphereSettings(atmosphereSettings.current)
      island.setDestinationOpen(destinationOpen.current)
      island.setGardenEffects(cornerEffectsRef.current)
      island.setSpecialDateGlow(specialDateGlowRef.current)
      island.setStargazingDates(stargazingDatesRef.current)
      if (moodLanternRef.current !== 'off') island.playLocalEmote(`mood-${moodLanternRef.current}` as WorldEmoteType)
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

  async function toggleAmbience() {
    const existing = audioContext.current
    if (existing?.state === 'running') {
      await existing.suspend()
      setAmbienceOn(false)
      return
    }
    const Context = window.AudioContext
    if (!Context) {
      setAmbienceMessage('Ambient audio is not available in this browser.')
      return
    }
    setAmbienceMessage('')
    try {
      const context = existing ?? new Context()
      audioContext.current = context
      if (!existing) {
        const master = context.createGain()
        master.gain.value = 0.018
        master.connect(context.destination)
        for (const [frequency, gainValue] of [[110, 0.38], [164.81, 0.21], [220, 0.12]] as const) {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          oscillator.type = 'sine'
          oscillator.frequency.value = frequency
          gain.gain.value = gainValue
          oscillator.connect(gain)
          gain.connect(master)
          oscillator.start()
        }
      }
      await context.resume()
      setAmbienceOn(true)
    } catch (error) {
      logError(error, 'audio/ambience')
      setAmbienceMessage('Ambient audio could not start. Try again after tapping the button.')
    }
  }

  async function leaveWorld() {
    await sync.current?.stop()
    sync.current = null
    onBack()
  }

  function enterHomeRoom() {
    setHomePosition(HOME_SPAWN)
    setHomeFocus(null)
    setDestination(null)
    setActiveCorner(null)
    setWardrobeOpen(false)
    setHomeRoomOpen(true)
    sync.current?.setZone('home', HOME_SPAWN.x, HOME_SPAWN.y)
  }

  function returnToIslandFromHome() {
    const position = scene.current?.getLocalPosition()
    setHomeRoomOpen(false)
    setDestination(null)
    setActiveCorner(null)
    setHomeFocus(null)
    if (position) sync.current?.setZone('island', position.x, position.y)
  }

  function openHomePanel(focus: HomePanelFocus) {
    setHomeFocus(focus)
    setDestination(focus === 'garden' ? 'garden' : 'home')
  }

  function applyAppearance(appearance: CharacterAppearance) {
    if (!roster) return
    const nextRoster = { ...roster, local: { ...roster.local, appearance } }
    setRoster(nextRoster)
    scene.current?.updateLocalAppearance(appearance)
    sync.current?.publishAppearance(appearance)
  }

  function sendWorldEmote(kind: WorldEmoteType) {
    const now = performance.now()
    if (!canSendWorldEmote(lastEmoteSentAt.current, now)) {
      setMomentMessage('Take a little pause between moments.')
      return false
    }
    lastEmoteSentAt.current = now
    scene.current?.playLocalEmote(kind)
    const shared = sync.current?.publishEmote(kind) ?? false
    setMomentMessage(shared ? 'A little moment is shared with your person.' : 'A little moment, just for you while offline.')
    return true
  }

  function handleWelcomeRead() {
    setWelcomeHasBeenRead(true)
    void recordWelcomeRead().catch(error => {
      logError(error, 'firestore/welcome-progress')
      setNotice('The letter is yours to read. We could not save that progress, but you can keep exploring.')
    })
  }

  function startTutorial() {
    if (homeRoomOpen) returnToIslandFromHome()
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
    <main className={`world-page${worldModalOpen ? ' world-page--destination' : ''}`}>
      <header className="world-header">
        <Button variant="quiet" className="world-back" onClick={() => { void leaveWorld() }}><span aria-hidden="true">←</span> Back</Button>
        <div>
          <p className="eyebrow">A little place to wander</p>
          <h1>Our little island</h1>
        </div>
      </header>
      {specialDateGlow && <div className="special-day-banner" role="status">Today has a little extra glow for your special day <span aria-hidden="true">✦</span></div>}
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
            <button type="button" className="replay-tutorial" disabled={!roster} onClick={() => setWardrobeOpen(true)}>Open wardrobe</button>
            <section className="world-settings" aria-label="Island atmosphere settings">
              <h3>Island atmosphere</h3>
              <label htmlFor="day-night-mode">Light</label>
              <select id="day-night-mode" value={dayNight} onChange={event => setDayNight(event.target.value as DayNightMode)}>
                <option value="auto">Local time</option><option value="day">Day</option><option value="night">Night</option>
              </select>
              <label htmlFor="weather-mode">Decorative weather</label>
              <select id="weather-mode" value={weather} onChange={event => setWeather(event.target.value as DecorativeWeather)}>
                <option value="clear">Clear</option><option value="rain">Gentle rain</option><option value="snow">Soft snow</option>
              </select>
              <label className="world-settings__check"><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
              <label className="world-settings__check"><input type="checkbox" checked={lowPower} onChange={event => setLowPower(event.target.checked)} /> Low-power mode</label>
              <button type="button" className="replay-tutorial" onClick={() => { void toggleAmbience() }}>{ambienceOn ? 'Mute ambience' : 'Play soft ambience'}</button>
              <label htmlFor="mood-lantern-color">Mood lantern</label>
              <select id="mood-lantern-color" value={moodLantern} onChange={event => {
                const color = event.target.value as MoodLanternColor
                const kind = `mood-${color}` as WorldEmoteType
                if (sendWorldEmote(kind)) setMoodLantern(color)
              }}>
                <option value="off">Off</option><option value="gold">Warm gold</option><option value="rose">Soft rose</option><option value="sage">Quiet sage</option>
              </select>
              {ambienceMessage && <p className="world-settings__message" role="status">{ambienceMessage}</p>}
            </section>
            <section className="world-moments" aria-label="Shared moments">
              <h3>Little moments</h3>
              <div className="world-moments__buttons">
                <button type="button" disabled={!roster} onClick={() => sendWorldEmote('wave')}>Wave</button>
                <button type="button" disabled={!roster} onClick={() => sendWorldEmote('heart')}>Heart</button>
                <button type="button" disabled={!roster} onClick={() => sendWorldEmote('sparkle')}>Sparkle</button>
                <button type="button" disabled={!roster} onClick={() => sendWorldEmote('hug')}>Hug</button>
              </div>
              {momentMessage && <p role="status">{momentMessage}</p>}
              <button type="button" className="replay-tutorial" disabled={!roster} onClick={() => setSpecialDatesOpen(true)}>Our special dates</button>
            </section>
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
        homeFocus={homeFocus}
        showWelcomeOnFirstVisit={progressReady && !welcomeHasBeenRead}
        welcomeHasBeenRead={welcomeHasBeenRead}
        onWelcomeRead={handleWelcomeRead}
        onStartTutorial={startTutorial}
        tutorialGuide={tutorialGuide}
      />}
      {destination === null && tutorialGuide}
      {homeRoomOpen && destination === null && roster && <HomeInterior
        localCharacter={roster.local.config.id}
        remoteCharacter={roster.remote.config.id}
        localPosition={homePosition}
        remotePosition={remotePosition}
        onMove={(x, y) => { setHomePosition({ x, y }); sync.current?.publishPosition(x, y, performance.now()) }}
        onOpenPanel={openHomePanel}
        onExit={returnToIslandFromHome}
      />}
      {introMode && roster && <IntroExperience
        uid={uid}
        talhaUid={roster.talhaUid}
        mode={introMode}
        onClose={() => setIntroMode(null)}
        onComplete={() => { setIntroMode(null); startTutorial() }}
      />}
      {activeCorner && roster && <PersonalCornerPanel
        uid={uid}
        talhaUid={roster.talhaUid}
        mannuUid={roster.local.config.id === 'mannu' ? uid : roster.remoteUid}
        active={activeCorner}
        onClose={() => setActiveCorner(null)}
        onOpenWardrobe={() => setWardrobeOpen(true)}
        onEffects={handleCornerEffects}
      />}
      {wardrobeOpen && roster && <AppearancePanel
        key={uid}
        uid={uid}
        appearance={roster.local.appearance}
        onClose={() => setWardrobeOpen(false)}
        onSaved={applyAppearance}
      />}
      {specialDatesOpen && roster && <SpecialDatesPanel
        uid={uid}
        talhaUid={roster.talhaUid}
        initialDates={specialDates}
        onClose={() => setSpecialDatesOpen(false)}
        onDatesChange={handleSpecialDatesChange}
      />}
      {stargazingOpen && <StargazingPanel
        dates={specialDates}
        selectedDates={stargazingDates}
        onSelectedDatesChange={handleStargazingDatesChange}
        onClose={() => setStargazingOpen(false)}
      />}
      {dreamBoardOpen && roster && <DreamBoardPanel
        uid={uid}
        talhaUid={roster.talhaUid}
        mannuUid={roster.local.config.id === 'mannu' ? uid : roster.remoteUid}
        onClose={() => setDreamBoardOpen(false)}
      />}
    </main>
  )
}
