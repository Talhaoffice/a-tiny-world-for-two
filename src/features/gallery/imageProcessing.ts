/**
 * Client-side image processing pipeline for the photo gallery.
 *
 * Rules:
 * - Reject non-images and files > 15 MB before decoding.
 * - Decode with createImageBitmap so rotated phone photos come out upright.
 * - Redraw to canvas: full max 1280px long side, JPEG at 0.82/0.72/0.62/0.52 until
 *   base64 body < 400,000 chars. Thumb max 240px under 24,000 chars.
 * - Re-encoding strips EXIF/GPS metadata.
 * - Never crashes; unsupported formats (e.g. HEIC on non-Safari) get a calm message.
 */

import { FULL_BASE64_MAX, PHOTO_FILE_MAX_BYTES, THUMB_BASE64_MAX } from './galleryContent'

export type ProcessedPhoto = {
  /** base64 body of the thumbnail JPEG (no prefix) */
  thumb: string
  thumbWidth: number
  thumbHeight: number
  /** base64 body of the full-size JPEG (no prefix) */
  fullImage: string
  fullWidth: number
  fullHeight: number
}

const FULL_MAX_PX = 1280
const THUMB_MAX_PX = 240
const FULL_QUALITIES = [0.82, 0.72, 0.62, 0.52] as const

function stripPrefix(dataUrl: string): string {
  const idx = dataUrl.indexOf(',')
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

function drawBitmap(bitmap: ImageBitmap, maxPx: number): HTMLCanvasElement {
  const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height))
  const w = Math.round(bitmap.width * scale)
  const h = Math.round(bitmap.height * scale)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable.')
  ctx.drawImage(bitmap, 0, 0, w, h)
  return canvas
}

function encodeThumb(canvas: HTMLCanvasElement): string {
  // Try at 0.82, step down until under limit
  for (const q of FULL_QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q)
    const body = stripPrefix(url)
    if (body.length <= THUMB_BASE64_MAX) return body
  }
  // Last resort: shrink further
  const smaller = document.createElement('canvas')
  const scale = Math.sqrt(THUMB_BASE64_MAX / stripPrefix(canvas.toDataURL('image/jpeg', 0.52)).length)
  smaller.width = Math.max(1, Math.round(canvas.width * scale))
  smaller.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = smaller.getContext('2d')
  if (ctx) ctx.drawImage(canvas, 0, 0, smaller.width, smaller.height)
  return stripPrefix(smaller.toDataURL('image/jpeg', 0.52))
}

function encodeFull(canvas: HTMLCanvasElement): { body: string; ok: boolean } {
  for (const q of FULL_QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q)
    const body = stripPrefix(url)
    if (body.length <= FULL_BASE64_MAX) return { body, ok: true }
  }
  return { body: '', ok: false }
}

export type ProcessResult =
  | { ok: true; photo: ProcessedPhoto }
  | { ok: false; error: string }

export async function processImageFile(file: File): Promise<ProcessResult> {
  if (!file.type.startsWith('image/')) {
    return { ok: false, error: 'Please choose an image file (JPEG, PNG, WEBP, or similar).' }
  }
  if (file.size > PHOTO_FILE_MAX_BYTES) {
    return { ok: false, error: 'That file is larger than 15 MB. Please choose a smaller image or take a screenshot.' }
  }

  let bitmap: ImageBitmap
  try {
    // imageOrientation: 'from-image' corrects EXIF rotation on phone photos
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return {
      ok: false,
      error:
        file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
          ? 'HEIC photos are not supported in this browser. Please convert to JPEG or PNG first, or take a screenshot.'
          : 'This image could not be decoded. Please try a JPEG or PNG file.',
    }
  }

  try {
    const fullCanvas = drawBitmap(bitmap, FULL_MAX_PX)
    const thumbCanvas = drawBitmap(bitmap, THUMB_MAX_PX)
    bitmap.close()

    const fullResult = encodeFull(fullCanvas)
    if (!fullResult.ok) {
      return { ok: false, error: 'The image could not be compressed small enough to save. Try a lower-resolution photo.' }
    }

    const thumb = encodeThumb(thumbCanvas)

    return {
      ok: true,
      photo: {
        thumb,
        thumbWidth: thumbCanvas.width,
        thumbHeight: thumbCanvas.height,
        fullImage: fullResult.body,
        fullWidth: fullCanvas.width,
        fullHeight: fullCanvas.height,
      },
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Image processing failed. Please try again.' }
  }
}
