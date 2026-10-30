import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import react from '@vitejs/plugin-react'
import { readFile } from 'node:fs/promises'

const root = process.cwd()
const wardrobePath = '/src/features/world/WardrobePanel.tsx'
const galleryPath = '/src/features/gallery/GalleryPanel.tsx'
const mockIds = {
  playerLooks: '\0panel-mock:player-looks',
  petStore: '\0panel-mock:pet-store',
  galleryContent: '\0panel-mock:gallery-content',
}

const mocks = {
  [mockIds.playerLooks]: 'export async function savePlayerLook() { return undefined }',
  [mockIds.petStore]: 'export async function savePetDraft(_uid, draft) { return draft }',
  [mockIds.galleryContent]: `
    export const GALLERY_SOFT_CAP = 100
    export const PHOTO_CAPTION_MAX = 140
    export const PHOTO_MIME = 'image/jpeg'
    export function watchPhotos() { return () => {} }
    export async function addPhoto() { return 'sample' }
    export async function deletePhoto() {}
    export async function loadPhotoFull() { return null }
    export async function updatePhotoCaption() {}
  `,
}

function normalizedImporter(importer = '') {
  return importer.split('?')[0].replaceAll('\\', '/')
}

const panelMocks = {
  name: 'panel-render-check-mocks',
  enforce: 'pre',
  resolveId(source, importer) {
    const from = normalizedImporter(importer)
    if (from.endsWith('/features/world/WardrobePanel.tsx')) {
      if (source === './playerLooks') return mockIds.playerLooks
      if (source === './petStore') return mockIds.petStore
    }
    if (from.endsWith('/features/gallery/GalleryPanel.tsx') && source === './galleryContent') {
      return mockIds.galleryContent
    }
    if (from.endsWith('/features/gallery/imageProcessing.ts') && source === './galleryContent') {
      return mockIds.galleryContent
    }
    return null
  },
  load(id) {
    return mocks[id] ?? null
  },
}

const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: 'custom',
  server: { middlewareMode: true },
  logLevel: 'error',
  plugins: [react(), panelMocks],
})

function check(name, element, expectedText) {
  const markup = renderToString(element)
  const visibleText = markup.replace(/<[^>]*>/g, ' ').replaceAll('&amp;', '&').replace(/\s+/g, ' ')
  const hasExpectedText = expectedText.every(text => visibleText.includes(text))
  const rendersContent = markup.length > 0 && /<(div|section)\b/.test(markup)
  const passed = hasExpectedText && rendersContent
  process.stdout.write(`${name}: markup=${markup.length}; expected=${hasExpectedText}; frame=${rendersContent}; ${passed ? 'PASS' : 'FAIL'}\n`)
  if (!passed) throw new Error(`${name} did not render its expected content.`)
}

try {
  const worldCss = await readFile(new URL('../src/features/world/world.css', import.meta.url), 'utf8')
  const hideRule = worldCss.match(/\.world-page--destination[^{}]*\{visibility:hidden;pointer-events:none\}/)?.[0] ?? ''
  const visibilityExceptions = ['.wardrobe-overlay', '.gallery-overlay', '.app-error', '.panel-debug-panel']
  const exceptionsPresent = visibilityExceptions.every(selector => hideRule.includes(`:not(${selector})`))
  process.stdout.write(`panel visibility allowlist: ${exceptionsPresent ? 'PASS' : 'FAIL'}\n`)
  if (!exceptionsPresent) throw new Error('The open-panel CSS allowlist hides a modal or fallback.')

  const [{ WardrobePanel }, { GalleryPanel }, { MANNU_DEFAULT_LOOK }] = await Promise.all([
    server.ssrLoadModule(wardrobePath),
    server.ssrLoadModule(galleryPath),
    server.ssrLoadModule('/src/features/world/appearanceCatalog.ts'),
  ])
  const noop = () => {}
  const wardrobe = (lookLoadState, petLoadState, initialPet = { kind: 'none', name: '' }) => React.createElement(WardrobePanel, {
    uid: 'ssr-check',
    characterId: 'mannu',
    currentLook: MANNU_DEFAULT_LOOK,
    lookLoadState,
    lookLoadError: lookLoadState === 'error' ? 'Saved look read failed.' : '',
    onRetryLook: noop,
    petLoadState,
    onRetryPet: noop,
    initialTab: 'companion',
    initialPet,
    onClose: noop,
    onSaved: noop,
    onPetSaved: noop,
  })

  check('wardrobe/loading', wardrobe('loading', 'loading'), ['Wardrobe & Creator', 'Loading your saved look', 'Loading companion settings'])
  check('wardrobe/missing-documents', wardrobe('empty', 'empty'), ['Wardrobe & Creator', 'No saved look yet', 'No companion saved yet'])
  check('wardrobe/error', wardrobe('error', 'error'), ['Wardrobe & Creator', 'Saved look read failed.', 'Retry saved look', 'Copy diagnostics'])
  check('wardrobe/loaded', wardrobe('saved', 'saved', { kind: 'cat', name: 'Sample pet' }), ['Wardrobe & Creator', 'A little cat companion', 'Companion name'])

  const gallery = (snapshot) => React.createElement(GalleryPanel, {
    uid: 'ssr-check',
    onClose: noop,
    initialSnapshot: snapshot,
  })
  const samplePhoto = {
    id: 'sample-photo', authorUid: 'sample', caption: 'Sample photo', takenOn: null,
    createdAt: { toMillis: () => 1, toDate: () => new Date(1) },
    width: 1, height: 1, thumb: 'c2FtcGxl', mime: 'image/jpeg', schemaVersion: 1, hasPendingWrites: false,
  }

  check('gallery/loading', gallery({ photos: [], loading: true, error: '' }), ['Our Photo Wall', 'Loading your photos'])
  check('gallery/missing-documents', gallery({ photos: [], loading: false, error: '' }), ['Our Photo Wall', 'No photos yet'])
  check('gallery/error', gallery({ photos: [], loading: false, error: 'Photo list read failed.' }), ['Our Photo Wall', 'Photo list read failed.', 'Retry', 'Copy diagnostics'])
  check('gallery/loaded', gallery({ photos: [samplePhoto], loading: false, error: '' }), ['Our Photo Wall', 'Sample photo'])
} finally {
  await server.close()
}
