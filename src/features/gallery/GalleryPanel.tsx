import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from 'react'
import {
  addPhoto,
  deletePhoto,
  loadPhotoFull,
  updatePhotoCaption,
  watchPhotos,
  GALLERY_SOFT_CAP,
  PHOTO_CAPTION_MAX,
  PHOTO_MIME,
  type PhotoFull,
  type PhotoMeta,
} from './galleryContent'
import { processImageFile } from './imageProcessing'
import { toAppError } from '../../lib/errors'
import { logError } from '../../lib/logger'
import { CopyDiagnosticsButton } from '../../components/CopyDiagnosticsButton'
import './gallery.css'

type Props = {
  uid: string
  onClose: () => void
  /** Deterministic first render for the local SSR panel check; production callers omit it. */
  initialSnapshot?: { photos: PhotoMeta[]; loading: boolean; error: string; errorCode?: string }
}

type SaveState = 'idle' | 'resizing' | 'saving' | 'saved' | 'not-saved'

export function GalleryPanel({ uid, onClose, initialSnapshot }: Props) {
  const [photos, setPhotos] = useState<PhotoMeta[]>(() => initialSnapshot?.photos ?? [])
  const [loading, setLoading] = useState(() => initialSnapshot?.loading ?? true)
  const [listError, setListError] = useState(() => initialSnapshot?.error ?? '')
  const [lastErrorCode, setLastErrorCode] = useState(() => initialSnapshot?.errorCode ?? '')
  const [listAttempt, setListAttempt] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [uploadError, setUploadError] = useState('')
  const [captionDraft, setCaptionDraft] = useState('')
  const [takenOn, setTakenOn] = useState('')
  const [pendingPhoto, setPendingPhoto] = useState<{
    thumb: string; thumbWidth: number; thumbHeight: number
    fullImage: string; fullWidth: number; fullHeight: number
  } | null>(null)
  const [viewPhoto, setViewPhoto] = useState<PhotoMeta | null>(null)
  const [fullImage, setFullImage] = useState<PhotoFull | null>(null)
  const [fullLoading, setFullLoading] = useState(false)
  const [fullError, setFullError] = useState('')
  const [editCaption, setEditCaption] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editError, setEditError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)
  const viewRef = useRef<HTMLDivElement>(null)

  // Attach listener only while gallery is open
  useEffect(() => {
    setLoading(true)
    setListError('')
    setLastErrorCode('')
    let stop = () => {}
    let settled = false
    const loadingTimeout = window.setTimeout(() => {
      if (settled) return
      settled = true
      setLoading(false)
      setListError('The photo list is taking too long to load. Check your connection and retry.')
      setLastErrorCode('deadline-exceeded')
    }, 10_000)
    try {
      stop = watchPhotos(
        newPhotos => {
          settled = true
          window.clearTimeout(loadingTimeout)
          setPhotos(newPhotos)
          setLoading(false)
          setListError('')
          setLastErrorCode('')
        },
        error => {
          settled = true
          window.clearTimeout(loadingTimeout)
          logError(error, 'firestore/gallery-watch')
          const appError = toAppError(error)
          setListError(appError.userMessage)
          setLastErrorCode(appError.code)
          setLoading(false)
        },
      )
    } catch (error) {
      settled = true
      window.clearTimeout(loadingTimeout)
      logError(error, 'firestore/gallery-watch-start')
      const appError = toAppError(error)
      setListError(appError.userMessage)
      setLastErrorCode(appError.code)
      setLoading(false)
    }
    return () => {
      window.clearTimeout(loadingTimeout)
      stop()
    }
  }, [listAttempt])

  // Focus viewer on open for keyboard nav
  useEffect(() => {
    if (viewPhoto) {
      viewRef.current?.focus()
      setFullImage(null)
      setFullLoading(true)
      setFullError('')
      setEditCaption(viewPhoto.caption)
      setDeleteConfirm(false)
      setEditError('')
      loadPhotoFull(viewPhoto.id).then(full => {
        setFullImage(full)
        setFullLoading(false)
      }).catch(err => {
        logError(err, 'firestore/gallery-load-full')
        const appError = toAppError(err)
        setFullError(appError.userMessage)
        setLastErrorCode(appError.code)
        setFullLoading(false)
      })
    }
  }, [viewPhoto])

  const viewIndex = viewPhoto ? photos.findIndex(p => p.id === viewPhoto.id) : -1

  function navigateViewer(delta: number) {
    const next = photos[viewIndex + delta]
    if (next) setViewPhoto(next)
  }

  function handleViewerKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') setViewPhoto(null)
    else if (e.key === 'ArrowLeft') navigateViewer(-1)
    else if (e.key === 'ArrowRight') navigateViewer(1)
  }

  async function processAndStage(file: File) {
    setUploadError('')
    setSaveState('resizing')
    const result = await processImageFile(file)
    if (!result.ok) {
      setUploadError(result.error)
      setSaveState('idle')
      return
    }
    setPendingPhoto(result.photo)
    setSaveState('idle')
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void processAndStage(file)
    e.target.value = ''
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) void processAndStage(file)
  }

  async function submitPhoto() {
    if (savingRef.current || !pendingPhoto) return
    savingRef.current = true
    setSaveState('saving')
    setUploadError('')
    try {
      await addPhoto({
        caption: captionDraft.trim(),
        takenOn: takenOn || null,
        width: pendingPhoto.thumbWidth,
        height: pendingPhoto.thumbHeight,
        thumb: pendingPhoto.thumb,
        fullImage: pendingPhoto.fullImage,
        fullWidth: pendingPhoto.fullWidth,
        fullHeight: pendingPhoto.fullHeight,
      })
      setPendingPhoto(null)
      setCaptionDraft('')
      setTakenOn('')
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch (err) {
      logError(err, 'firestore/gallery-add')
      const appError = toAppError(err)
      setUploadError(appError.userMessage)
      setLastErrorCode(appError.code)
      setSaveState('not-saved')
    } finally {
      savingRef.current = false
    }
  }

  const saveCaption = useCallback(async () => {
    if (!viewPhoto || editBusy) return
    setEditBusy(true)
    setEditError('')
    try {
      await updatePhotoCaption(viewPhoto.id, editCaption.trim())
      setViewPhoto(prev => prev ? { ...prev, caption: editCaption.trim() } : prev)
      setPhotos(prev => prev.map(p => p.id === viewPhoto.id ? { ...p, caption: editCaption.trim() } : p))
    } catch (err) {
      logError(err, 'firestore/gallery-caption')
      const appError = toAppError(err)
      setEditError(appError.userMessage)
      setLastErrorCode(appError.code)
    } finally {
      setEditBusy(false)
    }
  }, [viewPhoto, editCaption, editBusy])

  const confirmDelete = useCallback(async () => {
    if (!viewPhoto || deleteBusy) return
    setDeleteBusy(true)
    try {
      await deletePhoto(viewPhoto.id)
      setPhotos(prev => prev.filter(p => p.id !== viewPhoto.id))
      setViewPhoto(null)
    } catch (err) {
      logError(err, 'firestore/gallery-delete')
      const appError = toAppError(err)
      setEditError(appError.userMessage)
      setLastErrorCode(appError.code)
    } finally {
      setDeleteBusy(false)
      setDeleteConfirm(false)
    }
  }, [viewPhoto, deleteBusy])

  const atSoftCap = photos.length >= GALLERY_SOFT_CAP

  const saveLabel =
    saveState === 'resizing' ? 'Resizing…' :
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved' ? 'Saved ✓' :
    saveState === 'not-saved' ? 'Not saved yet' :
    'Add to gallery'

  return (
    <div
      className="gallery-overlay"
      role="presentation"
      data-panel-loading={loading ? 'loading' : 'done'}
      data-panel-item-count={photos.length}
      data-panel-error-code={lastErrorCode}
    >
      <section
        className="gallery-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="gallery-title"
      >
        {/* Header */}
        <div className="gallery-header">
          <h2 id="gallery-title" className="gallery-title">Our Photo Wall</h2>
          <button type="button" className="gallery-close" aria-label="Close gallery" onClick={onClose}>×</button>
        </div>

        {/* Upload area */}
        {!atSoftCap && (
          <div
            className={`gallery-upload-zone${dragOver ? ' gallery-upload-zone--drag' : ''}`}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            aria-label="Drop a photo here or click to choose"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
          >
            <span className="gallery-upload-icon" aria-hidden="true">📷</span>
            <span>Drop a photo here or tap to choose</span>
            <span className="gallery-upload-note">JPEG · PNG · WEBP &bull; Max 15 MB &bull; EXIF/GPS is stripped</span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="gallery-file-input"
              aria-label="Choose photo file"
              onChange={handleFileInput}
            />
          </div>
        )}
        {atSoftCap && (
          <p className="gallery-cap-message" role="status">
            The wall has {photos.length} photos. That's a lovely collection — to add more, delete an older one first.
          </p>
        )}

        {/* Pending preview */}
        {pendingPhoto && (
          <div className="gallery-pending">
            <img
              src={`data:${PHOTO_MIME};base64,${pendingPhoto.thumb}`}
              alt="Preview of photo to add"
              className="gallery-pending-thumb"
            />
            <div className="gallery-pending-fields">
              <label htmlFor="gallery-caption">Caption <span className="gallery-optional">(optional, {PHOTO_CAPTION_MAX} chars)</span></label>
              <input
                id="gallery-caption"
                type="text"
                maxLength={PHOTO_CAPTION_MAX}
                value={captionDraft}
                onChange={e => setCaptionDraft(e.target.value)}
                placeholder="Add a caption…"
                className="gallery-caption-input"
              />
              <label htmlFor="gallery-taken-on">Date taken <span className="gallery-optional">(optional)</span></label>
              <input
                id="gallery-taken-on"
                type="date"
                value={takenOn}
                onChange={e => setTakenOn(e.target.value)}
                className="gallery-date-input"
              />
              <div className="gallery-pending-actions">
                <button
                  type="button"
                  className="gallery-btn-primary"
                  disabled={saveState === 'saving' || saveState === 'resizing'}
                  onClick={() => { void submitPhoto() }}
                >
                  {saveLabel}
                </button>
                <button
                  type="button"
                  className="gallery-btn-secondary"
                  onClick={() => { setPendingPhoto(null); setCaptionDraft(''); setTakenOn(''); setSaveState('idle') }}
                >
                  Cancel
                </button>
              </div>
              {saveState === 'not-saved' && <p className="gallery-save-state gallery-save-state--error" role="status">Not saved yet</p>}
              {saveState === 'saved' && <p className="gallery-save-state gallery-save-state--ok" role="status">Saved ✓</p>}
            </div>
          </div>
        )}

        {uploadError && <p className="gallery-error" role="alert">{uploadError}</p>}

        {/* Photo wall */}
        <div className="gallery-wall" aria-label="Photo wall">
          {loading && <p className="gallery-empty">Loading your photos…</p>}
          {!loading && listError && <div className="gallery-error-state" role="alert">
            <p>{listError}</p>
            <div className="gallery-error-state__actions">
              <button type="button" className="gallery-btn-primary" onClick={() => setListAttempt(attempt => attempt + 1)}>Retry</button>
              <CopyDiagnosticsButton />
            </div>
          </div>}
          {!loading && !listError && photos.length === 0 && (
            <p className="gallery-empty">No photos yet</p>
          )}
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              type="button"
              className={`gallery-polaroid${photo.hasPendingWrites ? ' gallery-polaroid--pending' : ''}`}
              style={{ '--tilt': `${((i * 7 + 3) % 7) - 3}deg` } as React.CSSProperties}
              aria-label={photo.caption || `Photo ${i + 1}`}
              onClick={() => setViewPhoto(photo)}
            >
              <div className="gallery-polaroid-frame">
                <img
                  src={`data:${PHOTO_MIME};base64,${photo.thumb}`}
                  alt={photo.caption || `Photo ${i + 1}`}
                  className="gallery-polaroid-img"
                  loading="lazy"
                />
              </div>
              {photo.caption && <p className="gallery-polaroid-caption">{photo.caption}</p>}
              {photo.hasPendingWrites && <span className="gallery-polaroid-pending" aria-label="Saving">…</span>}
            </button>
          ))}
        </div>
      </section>

      {/* Full-size viewer */}
      {viewPhoto && (
        <div
          className="gallery-viewer"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gallery-viewer-title"
          tabIndex={-1}
          ref={viewRef}
          onKeyDown={handleViewerKey}
        >
          <div className="gallery-viewer-inner">
            <button type="button" className="gallery-close gallery-viewer-close" aria-label="Close photo viewer" onClick={() => setViewPhoto(null)}>×</button>
            <div className="gallery-viewer-nav">
              <button type="button" className="gallery-viewer-arrow" aria-label="Previous photo" disabled={viewIndex <= 0} onClick={() => navigateViewer(-1)}>‹</button>
              <div className="gallery-viewer-content">
                {fullLoading && <p className="gallery-viewer-loading">Loading full image…</p>}
                {fullError && <p className="gallery-error" role="alert">{fullError}</p>}
                {fullImage && !fullLoading && (
                  <img
                    src={`data:${PHOTO_MIME};base64,${fullImage.image}`}
                    alt={viewPhoto.caption || 'Full-size photo'}
                    className="gallery-viewer-img"
                  />
                )}
                <h3 id="gallery-viewer-title" className="gallery-viewer-caption">
                  {viewPhoto.caption || <em>No caption</em>}
                </h3>
                {viewPhoto.takenOn && <p className="gallery-viewer-date">Taken {viewPhoto.takenOn}</p>}
                {/* Caption edit — author only */}
                {viewPhoto.authorUid === uid && (
                  <div className="gallery-viewer-edit">
                    <label htmlFor="gallery-edit-caption">Edit caption</label>
                    <input
                      id="gallery-edit-caption"
                      type="text"
                      maxLength={PHOTO_CAPTION_MAX}
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      className="gallery-caption-input"
                    />
                    <div className="gallery-viewer-edit-actions">
                      <button type="button" className="gallery-btn-primary" disabled={editBusy} onClick={() => { void saveCaption() }}>
                        {editBusy ? 'Saving…' : 'Save caption'}
                      </button>
                      {!deleteConfirm && (
                        <button type="button" className="gallery-btn-danger" disabled={deleteBusy} onClick={() => setDeleteConfirm(true)}>
                          Delete photo
                        </button>
                      )}
                      {deleteConfirm && (
                        <>
                          <button type="button" className="gallery-btn-danger" disabled={deleteBusy} onClick={() => { void confirmDelete() }}>
                            {deleteBusy ? 'Deleting…' : 'Confirm delete'}
                          </button>
                          <button type="button" className="gallery-btn-secondary" onClick={() => setDeleteConfirm(false)}>Cancel</button>
                        </>
                      )}
                    </div>
                    {editError && <p className="gallery-error" role="alert">{editError}</p>}
                  </div>
                )}
              </div>
              <button type="button" className="gallery-viewer-arrow" aria-label="Next photo" disabled={viewIndex >= photos.length - 1} onClick={() => navigateViewer(1)}>›</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
