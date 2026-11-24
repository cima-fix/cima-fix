// Code of the link of each space (RF-CATALOGO-14, 15, SDD 6.2, DD-15): 10 random characters from
// an alphabet without characters that are easy to confuse when read from a printed label
// (0 and O, 1, I and L). Uppercase only.
export const LINK_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export const LINK_CODE_LENGTH = 10

const LINK_CODE = new RegExp(`^[${LINK_CODE_ALPHABET}]{${LINK_CODE_LENGTH}}$`)

export function isLinkCode(code: string): boolean {
  return LINK_CODE.test(code)
}
