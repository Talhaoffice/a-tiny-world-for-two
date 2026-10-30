export type PanelDiagnostic = {
  open: boolean
  mounted: boolean
  loading: string
  itemCount: number
  lastErrorCode: string
  display: string
  visibility: string
  opacity: string
  height: string
  zIndex: string
  centerElement: { tag: string; className: string } | null
}

export type PanelDiagnosticsSnapshot = {
  updatedAt: string
  wardrobe: PanelDiagnostic
  pets: PanelDiagnostic
  gallery: PanelDiagnostic
  canvas: {
    exists: boolean
    width: number
    height: number
    backingWidth: number
    backingHeight: number
    parentWidth: number
    parentHeight: number
  }
}

const emptyPanel = (): PanelDiagnostic => ({
  open: false,
  mounted: false,
  loading: 'unknown',
  itemCount: 0,
  lastErrorCode: '',
  display: 'unknown',
  visibility: 'unknown',
  opacity: 'unknown',
  height: 'unknown',
  zIndex: 'unknown',
  centerElement: null,
})

let current: PanelDiagnosticsSnapshot = {
  updatedAt: '',
  wardrobe: emptyPanel(),
  pets: emptyPanel(),
  gallery: emptyPanel(),
  canvas: { exists: false, width: 0, height: 0, backingWidth: 0, backingHeight: 0, parentWidth: 0, parentHeight: 0 },
}

export function setPanelDiagnostics(snapshot: PanelDiagnosticsSnapshot) {
  current = {
    ...snapshot,
    wardrobe: { ...snapshot.wardrobe, centerElement: snapshot.wardrobe.centerElement && { ...snapshot.wardrobe.centerElement } },
    pets: { ...snapshot.pets, centerElement: snapshot.pets.centerElement && { ...snapshot.pets.centerElement } },
    gallery: { ...snapshot.gallery, centerElement: snapshot.gallery.centerElement && { ...snapshot.gallery.centerElement } },
    canvas: { ...snapshot.canvas },
  }
}

export function getPanelDiagnostics(): PanelDiagnosticsSnapshot {
  return {
    ...current,
    wardrobe: { ...current.wardrobe, centerElement: current.wardrobe.centerElement && { ...current.wardrobe.centerElement } },
    pets: { ...current.pets, centerElement: current.pets.centerElement && { ...current.pets.centerElement } },
    gallery: { ...current.gallery, centerElement: current.gallery.centerElement && { ...current.gallery.centerElement } },
    canvas: { ...current.canvas },
  }
}
