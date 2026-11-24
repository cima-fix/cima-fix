import { v2 as cloudinary } from 'cloudinary'

import { PHOTO_FORMATS } from '../../shared/domain/limits'

// Photos of the reports (SDD DD-09, 10.10). The browser uploads each photo straight to Cloudinary
// with parameters signed here; the API never receives the file. Signing, checking a signature
// and building a delivery URL are local computations: none of them calls Cloudinary, so they
// keep working while Cloudinary is down (RNF-DISPONIBILIDAD-04).

export type PhotoStorageConfig = {
  cloudName: string
  apiKey: string
  apiSecret: string
  // Folder of the environment (local, preview or production), so that each environment only
  // sees and cleans its own photos (SDD 10.10).
  folder: string
}

// What the browser sends to Cloudinary together with each file.
export type UploadParameters = {
  uploadUrl: string
  apiKey: string
  timestamp: number
  folder: string
  allowedFormats: string
  signature: string
}

// Identity of an uploaded photo as Cloudinary returns it after the upload.
export type UploadedPhotoProof = { publicId: string; version: number; signature: string }

export type PhotoUrls = { url: string; thumbnailUrl: string }

export type PhotoStorage = {
  signUpload(now: Date): UploadParameters
  isAuthentic(photo: UploadedPhotoProof): boolean
  urls(photo: { publicId: string; version: number }): PhotoUrls
}

// Cloudinary only accepts the formats of RF-REPORTE-09; the format is part of the signature, so
// the browser cannot change it.
const ALLOWED_FORMATS = PHOTO_FORMATS.join(',')

// Width of the thumbnails shown in lists. The full photo keeps its size; Cloudinary picks the
// format and quality for each browser, which also shows HEIC everywhere (RF-REPORTE-15).
const THUMBNAIL_WIDTH = 400

export function createPhotoStorage(config: PhotoStorageConfig): PhotoStorage {
  const sign = (params: Record<string, string | number>) =>
    cloudinary.utils.api_sign_request(params, config.apiSecret)

  const deliveryUrl = (publicId: string, version: number, transformation: object[]) =>
    cloudinary.url(publicId, {
      cloud_name: config.cloudName,
      secure: true,
      version,
      transformation,
      // Leaves out the SDK usage tag (`?_a=…`) that Cloudinary adds to every URL by default.
      urlAnalytics: false,
    })

  return {
    signUpload(now) {
      const timestamp = Math.floor(now.getTime() / 1000)
      const params = { timestamp, folder: config.folder, allowed_formats: ALLOWED_FORMATS }
      return {
        uploadUrl: `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`,
        apiKey: config.apiKey,
        timestamp,
        folder: config.folder,
        allowedFormats: ALLOWED_FORMATS,
        signature: sign(params),
      }
    },

    // SDD 10.10: Cloudinary signs its upload response with the account secret over the public id
    // and the version. A matching signature proves that the photo was uploaded to this account,
    // which only accepts uploads signed by this API.
    isAuthentic(photo) {
      const expected = sign({ public_id: photo.publicId, version: photo.version })
      return photo.signature === expected
    },

    urls(photo) {
      return {
        url: deliveryUrl(photo.publicId, photo.version, [{ fetch_format: 'auto', quality: 'auto' }]),
        thumbnailUrl: deliveryUrl(photo.publicId, photo.version, [
          { width: THUMBNAIL_WIDTH, crop: 'limit', fetch_format: 'auto', quality: 'auto' },
        ]),
      }
    },
  }
}
