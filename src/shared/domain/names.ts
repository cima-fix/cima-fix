// Names of buildings, spaces and categories (SDD 10.8).

// Form in which a name is stored and shown: trimmed, with consecutive whitespace collapsed.
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ')
}

// RF-CATALOGO-08, DD-16: comparison key that ignores letter case, accents and extra whitespace.
// Two names with the same key are the same name within their scope.
export function nameKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // removes accents
    .toLocaleLowerCase('es')
    .trim()
    .replace(/\s+/gu, ' ') // collapses consecutive whitespace
}
