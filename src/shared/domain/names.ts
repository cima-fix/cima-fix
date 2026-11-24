// Names of buildings, spaces and categories (SDD 10.8).

// Form in which a name is stored and shown: trimmed, with consecutive whitespace collapsed.
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ')
}

// RF-CATALOGO-08, DD-16: comparison key that ignores letter case, accents and extra whitespace.
// Two names with the same key are the same name within their scope. "ñ" is a letter of its own,
// not an accented "n", so "Peña" and "Pena" keep different keys.
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/(?<![nN])\u0303|(?!\u0303)\p{M}/gu, '') // removes accents, keeps the tilde of ñ
    .normalize('NFC')
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ') // collapses consecutive whitespace
}
