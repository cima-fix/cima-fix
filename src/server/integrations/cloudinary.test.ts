import { v2 as cloudinary } from 'cloudinary'
import { afterEach, describe, expect, it } from 'vitest'

import { createPhotoStorage } from './cloudinary'

const config = {
  cloudName: 'cima-fix-test',
  apiKey: '123456789012345',
  apiSecret: 'test-secret',
  folder: 'cima-fix/local',
}

const storage = createPhotoStorage(config)

// Signature Cloudinary would return for an upload, computed the way its own SDK checks it.
function responseSignature(publicId: string, version: number, secret = config.apiSecret) {
  return cloudinary.utils.api_sign_request({ public_id: publicId, version }, secret)
}

describe('signUpload', () => {
  const now = new Date('2026-11-23T20:00:00Z')
  const upload = storage.signUpload(now)

  it('signs the folder of the environment, the timestamp and the allowed formats', () => {
    expect(upload).toMatchObject({
      uploadUrl: 'https://api.cloudinary.com/v1_1/cima-fix-test/image/upload',
      apiKey: config.apiKey,
      timestamp: 1795464000,
      folder: 'cima-fix/local',
      allowedFormats: 'jpg,png,webp,heic',
    })
    const expected = cloudinary.utils.api_sign_request(
      { timestamp: 1795464000, folder: 'cima-fix/local', allowed_formats: 'jpg,png,webp,heic' },
      config.apiSecret,
    )
    expect(upload.signature).toBe(expected)
  })

  it('RF-REPORTE-09: changing the allowed formats breaks the signature', () => {
    const tampered = cloudinary.utils.api_sign_request(
      { timestamp: upload.timestamp, folder: upload.folder, allowed_formats: 'jpg,png,webp,heic,gif' },
      config.apiSecret,
    )
    expect(tampered).not.toBe(upload.signature)
  })

  it('never exposes the API secret', () => {
    expect(JSON.stringify(upload)).not.toContain(config.apiSecret)
  })
})

describe('isAuthentic', () => {
  const photo = { publicId: 'cima-fix/local/ab12cd34', version: 1795464000 }

  afterEach(() => {
    cloudinary.config(true)
  })

  it('accepts the signature that Cloudinary returns for an upload to this account', () => {
    const signature = responseSignature(photo.publicId, photo.version)
    expect(storage.isAuthentic({ ...photo, signature })).toBe(true)
  })

  it('agrees with the verification of the Cloudinary SDK', () => {
    const signature = responseSignature(photo.publicId, photo.version)
    cloudinary.config({ api_secret: config.apiSecret })
    // Not in the SDK types, but exported by its utils module.
    const sdkVerify = (
      cloudinary.utils as unknown as {
        verify_api_response_signature: (publicId: string, version: number, signature: string) => boolean
      }
    ).verify_api_response_signature
    expect(sdkVerify(photo.publicId, photo.version, signature)).toBe(true)
    expect(storage.isAuthentic({ ...photo, signature })).toBe(true)
  })

  it('rejects a photo uploaded to another account', () => {
    const signature = responseSignature(photo.publicId, photo.version, 'other-secret')
    expect(storage.isAuthentic({ ...photo, signature })).toBe(false)
  })

  it('rejects a signature reused for another photo or version', () => {
    const signature = responseSignature(photo.publicId, photo.version)
    expect(storage.isAuthentic({ ...photo, publicId: 'cima-fix/local/other', signature })).toBe(false)
    expect(storage.isAuthentic({ ...photo, version: photo.version + 1, signature })).toBe(false)
  })
})

describe('urls', () => {
  it('RF-REPORTE-15: lets Cloudinary choose the format and quality for each browser', () => {
    const urls = storage.urls({ publicId: 'cima-fix/local/ab12cd34', version: 1795464000 })
    expect(urls.url).toBe(
      'https://res.cloudinary.com/cima-fix-test/image/upload/f_auto,q_auto/v1795464000/cima-fix/local/ab12cd34',
    )
    expect(urls.thumbnailUrl).toBe(
      'https://res.cloudinary.com/cima-fix-test/image/upload/c_limit,f_auto,q_auto,w_400/v1795464000/cima-fix/local/ab12cd34',
    )
  })
})

describe('floorPlanUrl', () => {
  it('RNF-RENDIMIENTO-02: delivers the campus plan in the format and quality of each browser', () => {
    expect(storage.floorPlanUrl('cima-fix/plans/sauzal')).toBe(
      'https://res.cloudinary.com/cima-fix-test/image/upload/f_auto,q_auto/v1/cima-fix/plans/sauzal',
    )
  })
})
