import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react'
import type Phaser from 'phaser'
import { Button } from '../../components/Button'
import { realtimeDatabase } from '../../lib/firebase'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { PanelDebugPanel } from '../../components/PanelDebugPanel'
import { ConnectionBanner, DiagnosticsPanel } from '../../components/DiagnosticsPanel'
import { failPendingBootStep, logError, recordBootStep } from '../../lib/logger'
import { startupProgress } from '../../lib/startupProgress'
import { loadCharacterRoster, type CharacterRoster } from './characterRoster'
import { IntroExperience } from './IntroExperience'
import type { IntroMode } from './introFlow'
import { DestinationPanel, type Destination } from '../destinations/DestinationPanel'
import { connectWorldSync, type ConnectionState, type RemotePosition } from './worldSync'
import { HomeInterior, type HomePanelFocus, type RoomPosition } from './HomeInterior'
import { loadTutorialProgress, recordTutorialCompletion, recordWelcomeRead } from './tutorialProgress'
import { TutorialGuide } from './TutorialGuide'
import type { AtmosphereSettings, IslandPlace, IslandScene } from './IslandScene'
import type { DayNightMode, DecorativeWeather } from './worldAtmosphere'
import { PersonalCornerPanel, type PersonalCornerId } from './PersonalCornerPanel'
import { WardrobePanel } from './WardrobePanel'
import { loadPlayerLook, watchRemotePlayerLook, type PlayerLookLoadState } from './playerLooks'
import { MANNU_DEFAULT_LOOK, TALHA_DEFAULT_LOOK, type PlayerLook } from './appearanceCatalog'
import { loadPetDraft, watchRemotePet, type PetDraft } from './petStore'
import type { GardenCornerEffects } from './gardenCornerEffects'
import type { CharacterAppearance } from './characters.config'
import type { MoodLanternColor } from './characterSprites'
import { canSendWorldEmote, type WorldEmoteType } from './worldEmotes'
import { EMPTY_ANNUAL_SPECIAL_DATES, isAnnualSpecialDateToday, type AnnualSpecialDates } from './annualSpecialDates'
import { loadAnnualSpecialDates } from './specialDatesContent'
import { SpecialDatesPanel } from './SpecialDatesPanel'
import { StargazingPanel } from './StargazingPanel'
import { DreamBoardPanel } from './DreamBoardPanel'
import { GalleryPanel } from '../gallery/GalleryPanel'
import { CopyDiagnosticsButton } from '../../components/CopyDiagnosticsButton'
import { toAppError } from '../../lib/errors'
import './world.css'

type Props = { uid: string; onBack: () => void }
const HOME_SPAWN: RoomPosition = { x: 768, y: 820 }
const EMPTY_CORNER_EFFECTS: GardenCornerEffects = { lanternGlow: false, gardenFireflies: false, gardenGrowth: false }

export function WorldGame({ uid, onBack }: Props) {
  const gameHost = useRef<HTMLDivElement>(null)
  const joystickElement = useRef<HTMLDivElement>(null)
  const joystickPointer = useRef<number | null>(null)
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
  const [wardrobeInitialTab, setWardrobeInitialTab] = useState<'body' | 'companion'>('body')
  const [petDraft, setPetDraft] = useState<PetDraft>({ kind: 'none', name: '' })
  const [petLoadState, setPetLoadState] = useState<'loading' | 'saved' | 'empty' | 'error'>('loading')
  const [petLoadErrorCode, setPetLoadErrorCode] = useState('')
  const [playerLook, setPlayerLook] = useState<Omit<PlayerLook, 'updatedAt'>>(TALHA_DEFAULT_LOOK)
  const [playerLookLoadState, setPlayerLookLoadState] = useState<PlayerLookLoadState>('loading')
  const [playerLookLoadError, setPlayerLookLoadError] = useState('')
  const [playerLookLoadErrorCode, setPlayerLookLoadErrorCode] = useState('')
  const [startupState, setStartupState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [startupError, setStartupError] = useState('')
  const [startupAttempt, setStartupAttempt] = useState(0)
  const [startupStep, setStartupStep] = useState(startupProgress.getSnapshot().step)
  const [specialDatesOpen, setSpecialDatesOpen] = useState(false)
  const [stargazingOpen, setStargazingOpen] = useState(false)
  const [dreamBoardOpen, setDreamBoardOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
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
  const playerLookAttempt = useRef(0)
  const petLoadAttempt = useRef(0)
  const atmosphereSettings = useRef<AtmosphereSettings>({ dayNight, weather, reducedMotion, lowPower })
  const worldModalOpen = destination !== null || homeRoomOpen || activeCorner !== null || wardrobeOpen || specialDatesOpen || stargazingOpen || dreamBoardOpen || galleryOpen

  useEffect(() => startupProgress.subscribe(progress => {
    setStartupStep(progress.step)
    if (progress.status === 'ready') {
      setStartupState('ready')
      setStartupError('')
    } else if (progress.status === 'failed') {
      setStartupState('failed')
      setStartupError(`${progress.message ?? 'The island could not load.'} Stuck at: ${progress.step}.`)
    } else {
      setStartupState('loading')
      setStartupError('')
    }
  }), [])
  const handleCornerEffects = useCallback((effects: GardenCornerEffects) => setCornerEffects(effects), [])
  const handleSpecialDatesChange = useCallback((dates: AnnualSpecialDates) => setSpecialDates(dates), [])
  const handleStargazingDatesChange = useCallback((dates: string[]) => setStargazingDates(dates), [])
  const loadLocalPlayerLook = useCallback((activeRoster: CharacterRoster) => {
    const attempt = ++playerLookAttempt.current
    setPlayerLookLoadState('loading')
    setPlayerLookLoadError('')
    setPlayerLookLoadErrorCode('')
    void loadPlayerLook(uid, activeRoster.local.config.id, activeRoster.local.appearance).then(result => {
      if (attempt !== playerLookAttempt.current) return
      setPlayerLook(result.look)
      setPlayerLookLoadState(result.state)
      setPlayerLookLoadError(result.errorMessage ?? '')
      setPlayerLookLoadErrorCode(result.errorCode ?? '')
      try { scene.current?.updateLocalLook(result.look) }
      catch (error) { logError(error, 'game/player-look-apply') }
    }).catch(error => {
      if (attempt !== playerLookAttempt.current) return
      logError(error, 'firestore/player-look-init')
      setPlayerLook(activeRoster.local.config.id === 'talha' ? TALHA_DEFAULT_LOOK : MANNU_DEFAULT_LOOK)
      setPlayerLookLoadState('error')
      setPlayerLookLoadError('The saved look could not be loaded. A default look is shown.')
      setPlayerLookLoadErrorCode(toAppError(error).code)
    })
  }, [uid])
  const loadPetSettings = useCallback(() => {
    const attempt = ++petLoadAttempt.current
    setPetLoadState('loading')
    setPetLoadErrorCode('')
    void loadPetDraft(uid, (state, errorCode) => {
      if (attempt === petLoadAttempt.current) {
        setPetLoadState(state)
        setPetLoadErrorCode(errorCode ?? '')
      }
    }).then(draft => {
      if (attempt === petLoadAttempt.current) setPetDraft(draft)
    }).catch(error => {
      logError(error, 'firestore/pet-load-startup')
      if (attempt === petLoadAttempt.current) {
        setPetLoadState('error')
        setPetLoadErrorCode(toAppError(error).code)
      }
    })
  }, [uid])

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
    loadPetSettings()
    return () => { petLoadAttempt.current += 1 }
  }, [loadPetSettings])

  useEffect(() => {
    destinationOpen.current = destination !== null || homeRoomOpen || activeCorner !== null || wardrobeOpen || specialDatesOpen || stargazingOpen || dreamBoardOpen || galleryOpen
    scene.current?.setDestinationOpen(destinationOpen.current)
  }, [destination, homeRoomOpen, activeCorner, wardrobeOpen, specialDatesOpen, stargazingOpen, dreamBoardOpen, galleryOpen])

  useEffect(() => {
    let disposed = false
    let phaserBootStarted = false
    let worldSync: ReturnType<typeof connectWorldSync> | null = null
    setStartupState('loading')
    setStartupError('')
    setRoster(null)
    setIntroMode(null)
    setHomeRoomOpen(false)
    setHomeFocus(null)
    setActiveCorner(null)
    setWardrobeOpen(false)
    setSpecialDatesOpen(false)
    setStargazingOpen(false)
    setDreamBoardOpen(false)
    setGalleryOpen(false)
    setStargazingDates([])
    setCornerEffects(EMPTY_CORNER_EFFECTS)
    setSpecialDates(EMPTY_ANNUAL_SPECIAL_DATES)
    setMoodLantern('off')
    setMomentMessage('')
    setRemotePosition(null)
    const parent = gameHost.current
    if (!parent) {
      const error = Object.assign(new Error('Game host is unavailable.'), { code: 'failed-precondition' })
      setStartupState('failed')
      setStartupError('The island could not load. Retry or copy diagnostics.')
      failPendingBootStep(error)
      startupProgress.fail(startupProgress.getSnapshot().step, 'The island game area is unavailable.')
      return
    }
    const database = realtimeDatabase
    const releaseTouchPointers = () => {
      scene.current?.releaseTouchPointers()
      joystickPointer.current = null
      joystickElement.current?.style.setProperty('--joystick-x', '0px')
      joystickElement.current?.style.setProperty('--joystick-y', '0px')
    }
    window.addEventListener('blur', releaseTouchPointers)
    if (!database) {
      const error = Object.assign(new Error('Island connection is not configured.'), { code: 'unavailable' })
      setConnectionState('error')
      setNotice('The island connection is not configured.')
      setStartupState('failed')
      setStartupError('The island could not load. Retry or copy diagnostics.')
      recordBootStep('roster', 'failed', error)
      startupProgress.fail('roster', 'The island connection is not configured.')
      return () => window.removeEventListener('blur', releaseTouchPointers)
    }

    void loadCharacterRoster(uid).then(async roster => {
      if (disposed) return
      setRoster(roster)
      loadLocalPlayerLook(roster)
      void loadAnnualSpecialDates().then(dates => {
        if (!disposed) setSpecialDates(dates)
      }).catch(error => logError(error, 'firestore/special-dates-load'))
      if (roster.local.config.id === 'mannu' && !roster.introCompleted) setIntroMode('first-entry')
      worldSync = connectWorldSync(
        database,
        uid,
        roster.remoteUid,
        (position: RemotePosition | null) => {
          if (disposed) return
          setRemotePosition(position)
          try { scene.current?.setRemotePosition(position) }
          catch (error) { logError(error, 'rtdb/remote-position-scene') }
        },
        setConnectionState,
      )
      sync.current = worldSync
      worldSync.publishAppearance(roster.local.appearance)
      recordBootStep('phaserBoot', 'started')
      phaserBootStarted = true
      const [{ default: PhaserRuntime }, { IslandScene: Scene }] = await Promise.all([import('phaser'), import('./IslandScene')])
      if (disposed || !gameHost.current || !worldSync) return
      const hostBounds = parent.getBoundingClientRect()
      if (hostBounds.width <= 0) parent.style.width = '100%'
      if (hostBounds.height <= 0) parent.style.minHeight = '360px'
      const readyBounds = parent.getBoundingClientRect()
      if (readyBounds.width <= 0 || readyBounds.height <= 0) {
        throw Object.assign(new Error('Island canvas host has no measurable size.'), { code: 'failed-precondition' })
      }
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
        (state, error) => {
          if (disposed) return
          if (state === 'ready') {
            startupProgress.ready()
            setStartupState('ready')
            setStartupError('')
          } else {
            startupProgress.fail('sceneCreate', 'The island scene could not be created.')
            setStartupState('failed')
            setStartupError('The island could not load. Stuck at: sceneCreate.')
            if (error) logError(error, 'game/scene-startup')
          }
        },
      )
      island.setOnPetInteracted(petName => {
        setNotice(petName ? `You spend a quiet moment with ${petName}.` : 'You spend a quiet moment with your companion.')
      })
      island.setAtmosphereSettings(atmosphereSettings.current)
      island.setDestinationOpen(destinationOpen.current)
      island.setGardenEffects(cornerEffectsRef.current)
      island.setSpecialDateGlow(specialDateGlowRef.current)
      island.setStargazingDates(stargazingDatesRef.current)
      if (moodLanternRef.current !== 'off') island.playLocalEmote(`mood-${moodLanternRef.current}` as WorldEmoteType)
      island.setLocalPet(petDraft.kind, petDraft.name)
      scene.current = island
      game.current = new PhaserRuntime.Game({
        // Phaser.AUTO selects WebGL when supported and falls back to Canvas otherwise.
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
      if (phaserBootStarted) recordBootStep('phaserBoot', 'failed', error)
      startupProgress.fail(phaserBootStarted ? 'phaserBoot' : 'roster', 'The island could not load. Retry or copy diagnostics.')
      if (!disposed) {
        setConnectionState('error')
        setNotice('The island could not load. Retry or copy diagnostics.')
        setStartupError('The island could not load. Check the island setup, then retry or copy diagnostics.')
        setStartupState('failed')
      }
    })

    return () => {
      disposed = true
      playerLookAttempt.current += 1
      window.removeEventListener('blur', releaseTouchPointers)
      void worldSync?.stop()
      sync.current = null
      game.current?.destroy(true)
      game.current = null
      scene.current = null
    }
  }, [uid, startupAttempt, loadLocalPlayerLook])

  useEffect(() => {
    if (!roster?.remoteUid) return
    let active = true
    const unsubLook = watchRemotePlayerLook(
      roster.remoteUid,
      remoteLook => {
        if (!active || !remoteLook) return
        try { scene.current?.updateRemoteLook(remoteLook) }
        catch (error) { logError(error, 'firestore/remote-look-scene') }
      },
      err => logError(err, 'firestore/remote-look-watch'),
    )
    const unsubPet = watchRemotePet(
      roster.remoteUid,
      remotePet => {
        if (!active || !remotePet) return
        try { scene.current?.setRemotePet(remotePet.kind, remotePet.name) }
        catch (error) { logError(error, 'firestore/remote-pet-scene') }
      },
      err => logError(err, 'firestore/remote-pet-watch'),
    )
    return () => { active = false; unsubLook(); unsubPet() }
  }, [roster?.remoteUid])

  function moveJoystick(event: PointerEvent<HTMLDivElement>) {
    if (joystickPointer.current !== event.pointerId) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const radius = Math.min(bounds.width, bounds.height) / 2
    const maxTravel = Math.max(1, radius - 24)
    let x = (event.clientX - (bounds.left + bounds.width / 2)) / maxTravel
    let y = (event.clientY - (bounds.top + bounds.height / 2)) / maxTravel
    const magnitude = Math.hypot(x, y)
    if (magnitude > 1) {
      x /= magnitude
      y /= magnitude
    }
    const deadZone = 0.12
    if (magnitude <= deadZone) {
      x = 0
      y = 0
    } else if (magnitude > 0) {
      const adjustedMagnitude = (Math.min(magnitude, 1) - deadZone) / (1 - deadZone)
      x = x / magnitude * adjustedMagnitude
      y = y / magnitude * adjustedMagnitude
    }
    scene.current?.setTouchJoystick(event.pointerId, x, y)
    event.currentTarget.style.setProperty('--joystick-x', `${x * maxTravel}px`)
    event.currentTarget.style.setProperty('--joystick-y', `${y * maxTravel}px`)
  }

  function beginJoystick(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault()
    joystickPointer.current = event.pointerId
    event.currentTarget.setPointerCapture(event.pointerId)
    moveJoystick(event)
  }

  function endJoystick(event: PointerEvent<HTMLDivElement>) {
    scene.current?.releaseTouchPointer(event.pointerId)
    if (joystickPointer.current === event.pointerId) {
      joystickPointer.current = null
      event.currentTarget.style.setProperty('--joystick-x', '0px')
      event.currentTarget.style.setProperty('--joystick-y', '0px')
    }
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

  function retryStartup() {
    setStartupError('')
    startupProgress.begin('roster')
    setStartupAttempt(attempt => attempt + 1)
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
    if (!position) return
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
          {startupState !== 'ready' && <section className={`game-startup game-startup--${startupState}`} role={startupState === 'failed' ? 'alert' : 'status'} aria-live="polite">
            {startupState === 'loading' ? <p className="game-startup__progress"><span className="startup-spinner" aria-hidden="true" />Still connecting… {startupStep}.</p> : <>
              <h2>The island could not load</h2>
              <p>{startupError || 'Please retry, or copy diagnostics to help find the problem.'}</p>
              <div className="game-startup__actions">
                <button type="button" onClick={retryStartup}>Retry</button>
                <CopyDiagnosticsButton />
              </div>
            </>}
          </section>}
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
            <p><kbd>E</kbd> to explore nearby or pet a companion</p>
            <button type="button" className="replay-tutorial" onClick={startTutorial}>Replay tutorial</button>
            <button type="button" className="replay-tutorial" disabled={!roster} onClick={() => { setWardrobeInitialTab('body'); setWardrobeOpen(true) }}>Open wardrobe</button>
            <button type="button" className="replay-tutorial" disabled={!roster} onClick={() => { setWardrobeInitialTab('companion'); setWardrobeOpen(true) }}>Choose a pet companion</button>
            <button type="button" className="replay-tutorial" disabled={!roster} onClick={() => setGalleryOpen(true)}>Open photo gallery</button>
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
            <div ref={joystickElement} className="touch-joystick" role="group" tabIndex={0} aria-label="Movement joystick. Drag the control to walk; keyboard arrows or WASD also work."
              onPointerDown={beginJoystick} onPointerMove={moveJoystick} onPointerUp={endJoystick} onPointerCancel={endJoystick} onLostPointerCapture={endJoystick}>
              <span className="touch-joystick__ring" aria-hidden="true" />
              <span className="touch-joystick__knob" aria-hidden="true" />
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
        onOpenWardrobe={() => setWardrobeOpen(true)}
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
      {wardrobeOpen && roster && <ErrorBoundary title="Wardrobe could not load" diagnosticsScope="wardrobe">
        <WardrobePanel
          key={uid}
          uid={uid}
          characterId={roster.local.config.id}
          currentLook={playerLook}
          lookLoadState={playerLookLoadState}
          lookLoadError={playerLookLoadError}
          lookLoadErrorCode={playerLookLoadErrorCode}
          onRetryLook={() => loadLocalPlayerLook(roster)}
          petLoadState={petLoadState}
          petLoadErrorCode={petLoadErrorCode}
          onRetryPet={loadPetSettings}
          initialTab={wardrobeInitialTab}
          initialPet={petDraft}
          onClose={() => setWardrobeOpen(false)}
          onPetSaved={pet => {
            setPetDraft(pet)
            setPetLoadState('saved')
            setPetLoadErrorCode('')
            scene.current?.setLocalPet(pet.kind, pet.name)
          }}
          onSaved={look => {
            setPlayerLook(look)
            setPlayerLookLoadState('saved')
            setPlayerLookLoadError('')
            setPlayerLookLoadErrorCode('')
            scene.current?.updateLocalLook(look)
            const legacyAppearance: CharacterAppearance = {
              hair: look.hairStyle === 4 || look.hairStyle === 5 || look.hairStyle === 9 ? 'long' : 'short',
              outfit: look.bottom === 2 ? 'dress' : look.top === 1 ? 'cardigan' : 'jacket',
              accessory: look.accessory === 4 ? 'lantern-clip' : look.accessory === 2 ? 'sage-accent' : 'none',
            }
            applyAppearance(legacyAppearance)
          }}
        />
      </ErrorBoundary>}
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
      {galleryOpen && <ErrorBoundary title="Gallery could not load" diagnosticsScope="gallery"><GalleryPanel uid={uid} onClose={() => setGalleryOpen(false)} /></ErrorBoundary>}
      <PanelDebugPanel wardrobeOpen={wardrobeOpen} galleryOpen={galleryOpen} />
    </main>
  )
}
