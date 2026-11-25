import type { InferResponseType } from 'hono/client'
import type { UploadedPhoto } from '../../shared/schemas/reports.ts'
import { api } from '../api'

// Upload of the photos of a report (SDD DD-09, 8.2, 10.10): the browser sends each photo straight
// to Cloudinary with parameters the API signs, and only after the possible duplicates were
// decided. The API checks every signature when the report is registered.

export type UploadParameters = InferResponseType<(typeof api.photos)['upload-signature']['$post'], 200>

// Cloudinary's free plan rejects images over 25 megapixels (SDD 10.10, R-05).
const MAX_PIXELS = 25_000_000
const MAX_BYTES = 10 * 1024 * 1024

export class PhotoUploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PhotoUploadError'
  }
}

const isHeic = (file: File) => /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)

// SDD 10.10: a JPEG, PNG or WebP over 25 MP is reduced in the browser to that limit and encoded
// again as JPEG, with less quality until it fits in 10 MB. HEIC is uploaded as it is: reducing
// it needs `heic-to`, which is not part of the SPA yet.
async function fitTo25Megapixels(file: File): Promise<File> {
  if (isHeic(file)) return file
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    throw new PhotoUploadError(`No pudimos leer ${file.name}. Elige otra foto.`)
  }
  const pixels = bitmap.width * bitmap.height
  if (pixels <= MAX_PIXELS) {
    bitmap.close()
    return file
  }
  const scale = Math.sqrt(MAX_PIXELS / pixels)
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(bitmap.width * scale)
  canvas.height = Math.floor(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  for (const quality of [0.9, 0.8, 0.7, 0.6, 0.5]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (blob && blob.size <= MAX_BYTES) {
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
    }
  }
  throw new PhotoUploadError(`No pudimos reducir ${file.name} a 10 MB. Elige otra foto.`)
}

type CloudinaryResponse = {
  public_id: string
  version: number
  signature: string
  format: string
  bytes: number
}

// One photo to Cloudinary. A failure keeps the form as it was (RF-REPORTE-16).
export async function uploadPhoto(file: File, parameters: UploadParameters): Promise<UploadedPhoto> {
  const ready = await fitTo25Megapixels(file)
  const form = new FormData()
  form.append('file', ready)
  form.append('api_key', parameters.apiKey)
  form.append('timestamp', String(parameters.timestamp))
  form.append('folder', parameters.folder)
  form.append('allowed_formats', parameters.allowedFormats)
  form.append('signature', parameters.signature)

  let response: Response
  try {
    response = await fetch(parameters.uploadUrl, { method: 'POST', body: form })
  } catch {
    throw new PhotoUploadError('No pudimos subir las fotografías. Revisa tu conexión e inténtalo de nuevo.')
  }
  if (!response.ok) {
    throw new PhotoUploadError(`No pudimos guardar ${file.name}. Inténtalo de nuevo o envía el reporte sin ella.`)
  }
  const uploaded = (await response.json()) as CloudinaryResponse
  return {
    publicId: uploaded.public_id,
    version: uploaded.version,
    signature: uploaded.signature,
    format: uploaded.format as UploadedPhoto['format'],
    bytes: uploaded.bytes,
  }
}
