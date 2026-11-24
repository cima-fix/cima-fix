import { describe, expect, it } from 'vitest'

import { isLinkCode, LINK_CODE_ALPHABET } from '../../../shared/domain/link-code.ts'
import { linkCodeParam } from '../../../shared/schemas/catalog.ts'
import { generateLinkCode } from './link-code.ts'

describe('generateLinkCode', () => {
  it('RF-CATALOGO-14: produces codes of 10 characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      expect(isLinkCode(generateLinkCode())).toBe(true)
    }
  })

  it('RF-CATALOGO-14: produces a different code for each space', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateLinkCode()))
    expect(codes.size).toBe(1000)
  })

  it('discards the bytes that would favor some characters', () => {
    // 248 is the first discarded byte for an alphabet of 31 characters.
    const bytes = [248, 255, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
    const code = generateLinkCode((size) => Uint8Array.from(bytes.splice(0, size)))
    expect(code).toBe(LINK_CODE_ALPHABET.slice(0, 10))
  })

  it('keeps asking for random bytes until the code is complete', () => {
    let calls = 0
    const code = generateLinkCode((size) => {
      calls++
      return calls === 1 ? new Uint8Array(size).fill(255) : new Uint8Array(size)
    })
    expect(calls).toBe(2)
    expect(code).toBe(LINK_CODE_ALPHABET[0]?.repeat(10))
  })
})

describe('linkCodeParam', () => {
  it('accepts a code in any letter case and returns it in uppercase', () => {
    expect(linkCodeParam.parse({ code: 'k7p2x9qm4a' })).toEqual({ code: 'K7P2X9QM4A' })
  })
})
