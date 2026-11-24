import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from '../../../shared/domain/link-code.ts'

// Largest multiple of the alphabet size that fits in a byte. Bytes at or above it are discarded,
// so every character has the same probability (no modulo bias).
const ACCEPTED_BYTES = 256 - (256 % LINK_CODE_ALPHABET.length)

// New code for a space. With 31^10 possible codes a repetition is not expected; if it happened,
// the unique index on the column would reject the insert instead of giving two spaces one link.
export function generateLinkCode(
  randomBytes: (size: number) => Uint8Array = (size) =>
    crypto.getRandomValues(new Uint8Array(size)),
): string {
  let code = ''
  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of randomBytes(LINK_CODE_LENGTH)) {
      if (byte >= ACCEPTED_BYTES) continue
      code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length]
      if (code.length === LINK_CODE_LENGTH) break
    }
  }
  return code
}
