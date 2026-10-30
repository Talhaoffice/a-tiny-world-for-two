import { useEffect, useState } from 'react'
import { getPanelDiagnostics, setPanelDiagnostics, type PanelDiagnostic, type PanelDiagnosticsSnapshot } from '../lib/panelDiagnostics'
import { getRecentErrors } from '../lib/logger'
import './diagnostics.css'

type Props = {
  wardrobeOpen: boolean
  galleryOpen: boolean
}

function panelDiagnostic(
  element: HTMLElement | null,
  open: boolean,
  loading: string,
  itemCount: number,
  lastErrorCode: string,
  mounted = Boolean(element),
  hitTarget: HTMLElement | null = element,
): PanelDiagnostic {
  if (!element) {
    return {
      open,
      mounted: false,
      loading,
      itemCount,
      lastErrorCode,
      display: 'not-mounted',
      visibility: 'not-mounted',
      opacity: 'not-mounted',
      height: '0px',
      zIndex: 'not-mounted',
      centerElement: null,
    }
  }
  const style = getComputedStyle(element)
  const rect = element.getBoundingClientRect()
  const targetRect = hitTarget?.getBoundingClientRect()
  const hit = targetRect ? document.elementFromPoint(targetRect.left + targetRect.width / 2, targetRect.top + targetRect.height / 2) : null
  const className = hit ? Array.from(hit.classList).filter(token => /^[a-z0-9_-]+$/i.test(token)).join(' ').slice(0, 120) : ''
  return {
    open,
    mounted,
    loading,
    itemCount,
    lastErrorCode,
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    height: `${Math.round(rect.height)}px`,
    zIndex: style.zIndex,
    centerElement: hit ? { tag: hit.tagName.toLowerCase(), className } : null,
  }
}

function collect(props: Props): PanelDiagnosticsSnapshot {
  const wardrobeOverlay = document.querySelector<HTMLElement>('.wardrobe-overlay')
  const galleryOverlay = document.querySelector<HTMLElement>('.gallery-overlay')
  const wardrobeFallback = document.querySelector<HTMLElement>('.app-error[data-debug-scope="wardrobe"]')
  const galleryFallback = document.querySelector<HTMLElement>('.app-error[data-debug-scope="gallery"]')
  const wardrobe = wardrobeOverlay ?? wardrobeFallback
  const gallery = galleryOverlay ?? galleryFallback
  const wardrobeCard = wardrobeOverlay?.querySelector<HTMLElement>('.wardrobe-panel') ?? wardrobeFallback
  const galleryCard = galleryOverlay?.querySelector<HTMLElement>('.gallery-panel') ?? galleryFallback
  const petPicker = wardrobeOverlay?.querySelector<HTMLElement>('.wardrobe-companion-section') ?? null
  const wardrobeLoading = wardrobe?.dataset.lookLoading ?? (wardrobeFallback ? 'error' : 'not-mounted')
  const petLoading = wardrobe?.dataset.petLoading ?? (wardrobeFallback ? 'error' : 'not-mounted')
  const photosLoading = gallery?.dataset.panelLoading ?? (galleryFallback ? 'error' : 'not-mounted')
  const canvas = document.querySelector<HTMLCanvasElement>('.game-host canvas')
  const canvasRect = canvas?.getBoundingClientRect()
  const parentRect = canvas?.parentElement?.getBoundingClientRect()
  const recentErrors = getRecentErrors()
  const recentPanelError = (namespaces: string[]) => recentErrors.filter(event => namespaces.includes(event.namespace)).at(-1)?.code ?? ''

  return {
    updatedAt: new Date().toISOString(),
    wardrobe: panelDiagnostic(
      wardrobe,
      props.wardrobeOpen,
      wardrobeLoading,
      wardrobe?.querySelectorAll('[role="radio"]').length ?? 0,
      wardrobe?.dataset.lookErrorCode || wardrobeFallback?.dataset.errorCode || recentPanelError(['firestore/player-look-load', 'firestore/wardrobe-save']),
      Boolean(wardrobeOverlay || wardrobeFallback),
      wardrobeCard,
    ),
    pets: panelDiagnostic(
      wardrobe,
      props.wardrobeOpen && wardrobe?.dataset.activeTab === 'companion',
      petLoading,
      petPicker?.querySelectorAll('[aria-pressed]').length ?? 0,
      wardrobe?.dataset.petErrorCode || wardrobeFallback?.dataset.errorCode || recentPanelError(['firestore/pet-load', 'firestore/wardrobe-save']),
      Boolean(petPicker),
      wardrobeCard,
    ),
    gallery: panelDiagnostic(
      gallery,
      props.galleryOpen,
      photosLoading,
      Number(gallery?.dataset.panelItemCount ?? 0),
      gallery?.dataset.panelErrorCode ?? galleryFallback?.dataset.errorCode ?? '',
      Boolean(galleryOverlay || galleryFallback),
      galleryCard,
    ),
    canvas: {
      exists: Boolean(canvas),
      width: Math.round(canvasRect?.width ?? 0),
      height: Math.round(canvasRect?.height ?? 0),
      backingWidth: canvas?.width ?? 0,
      backingHeight: canvas?.height ?? 0,
      parentWidth: Math.round(parentRect?.width ?? 0),
      parentHeight: Math.round(parentRect?.height ?? 0),
    },
  }
}

function enabled() {
  return typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === '1'
}

function PanelRow({ name, value }: { name: string; value: PanelDiagnostic }) {
  return <section className="panel-debug-panel__section">
    <strong>{name}</strong>
    <span>Open / mounted: {value.open ? 'yes' : 'no'} / {value.mounted ? 'yes' : 'no'}</span>
    <span>Loading: {value.loading}; items: {value.itemCount}; last error: {value.lastErrorCode || 'none'}</span>
    <span>Display / visibility / opacity / height / z-index: {value.display} / {value.visibility} / {value.opacity} / {value.height} / {value.zIndex}</span>
    <span>Center hit: {value.centerElement ? `${value.centerElement.tag}${value.centerElement.className ? `.${value.centerElement.className.replaceAll(' ', '.')}` : ''}` : 'none'}</span>
  </section>
}

export function PanelDebugPanel(props: Props) {
  const [snapshot, setSnapshot] = useState<PanelDiagnosticsSnapshot>(() => getPanelDiagnostics())

  useEffect(() => {
    if (!enabled()) return
    const update = () => {
      const next = collect(props)
      setPanelDiagnostics(next)
      setSnapshot(next)
    }
    update()
    const timer = window.setInterval(update, 750)
    return () => window.clearInterval(timer)
  }, [props.wardrobeOpen, props.galleryOpen])

  if (!enabled()) return null
  return <details className="panel-debug-panel">
    <summary>Panel and canvas diagnostics</summary>
    <div className="panel-debug-panel__body" aria-live="polite">
      <PanelRow name="Wardrobe" value={snapshot.wardrobe} />
      <PanelRow name="Pets" value={snapshot.pets} />
      <PanelRow name="Gallery" value={snapshot.gallery} />
      <section className="panel-debug-panel__section">
        <strong>Island canvas</strong>
        <span>Exists: {snapshot.canvas.exists ? 'yes' : 'no'}; CSS size: {snapshot.canvas.width}×{snapshot.canvas.height}; backing size: {snapshot.canvas.backingWidth}×{snapshot.canvas.backingHeight}</span>
        <span>Parent size: {snapshot.canvas.parentWidth}×{snapshot.canvas.parentHeight}</span>
        <span>Updated: {snapshot.updatedAt || 'waiting for measurement'}</span>
      </section>
    </div>
  </details>
}
