import { cleanName, nameKey } from '../../shared/domain/names.ts'
import type { MapThresholds } from '../../shared/domain/map-levels.ts'
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from '../../shared/domain/link-code.ts'
import { MAX_NAME_LENGTH } from '../../shared/domain/limits.ts'
import { assignRoleBody } from '../../shared/schemas/access.ts'
import { alertThresholdsBody, mapThresholdsBody } from '../../shared/schemas/thresholds.ts'
import type { StaffRole } from '../../shared/types/common.ts'
import type { Priority } from './reports'

/*
  In-memory stand-in for the Hono API (SDD 7) so the screens can be built
  before the client is wired to it. Same function shapes the typed client will
  expose; swap the bodies for `api.*` calls later. Data resets on reload. Only the
  catalog, staff and settings screens still use it (#68); everything else uses the API.
*/

export const CURRENT_USER = 'laura.martinez@uabc.edu.mx'

export const CAMPUS = { id: 'c-sauzal', slug: 'sauzal', name: 'Campus Sauzal' }

export type ApiErrorCode =
  | 'SPACE_UNAVAILABLE'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'OWN_REPORT'
  | 'ALREADY_CONFIRMED'
  | 'VALIDATION'
  | 'DUPLICATE_NAME'
  | 'HAS_OPEN_REPORTS'
  | 'HAS_ASSIGNED_REPORTS'
  | 'LAST_ADMIN'

export class ApiError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

// Fake latency so loading states are visible during development.
const delay = () => new Promise((resolve) => setTimeout(resolve, 150))

/* ---------- Open reports the catalog and role rules check ---------- */

// RF-CATALOGO-21 and RF-ACCESO-09 look at the open reports of a building, category or
// assignee. Same open reports as e2e/seed.ts.
const reports = [
  { building: 'Edificio 5', category: 'Iluminación', assignee: undefined },
  { building: 'Edificio 2', category: 'Red e internet', assignee: CURRENT_USER },
  { building: 'Edificio 5', category: 'Iluminación', assignee: undefined },
  { building: 'Edificio 5', category: 'Iluminación', assignee: 'carlos.ruiz@uabc.edu.mx' },
  { building: 'Edificio 5', category: 'Iluminación', assignee: undefined },
]

/* ---------- Catalog (SDD 7.2, Catálogo) ---------- */

export type Position = { x: number; y: number }
export type ManagedSpace = { id: string; name: string; isActive: boolean; code: string }
export type ManagedBuilding = {
  id: string
  name: string
  isActive: boolean
  // Position on the campus plan as a percentage of its width and height; null when not set.
  position: Position | null
  spaces: ManagedSpace[]
}
export type ManagedCategory = { id: string; name: string; severity: Priority; isActive: boolean }

const buildings: ManagedBuilding[] = [
  {
    id: 'b-2',
    name: 'Edificio 2',
    isActive: true,
    position: { x: 58, y: 24 },
    spaces: [
      { id: 's-21', name: 'Laboratorio 3', isActive: true, code: 'H4TR8WN2CE' },
      { id: 's-22', name: 'Salón 201', isActive: true, code: 'Q9VM3KD7XA' },
      { id: 's-23', name: 'Salón 202', isActive: false, code: 'B6YP2ZR8MT' },
    ],
  },
  {
    id: 'b-5',
    name: 'Edificio 5',
    isActive: true,
    position: { x: 74, y: 72 },
    spaces: [
      { id: 's-51', name: 'Salón 112', isActive: true, code: 'M3XK8PD2RW' },
      { id: 's-52', name: 'Salón 204', isActive: true, code: 'K7P2X9QM4A' },
    ],
  },
  {
    id: 'b-b',
    name: 'Biblioteca',
    isActive: true,
    position: { x: 22, y: 24 },
    spaces: [
      { id: 's-b1', name: 'Planta baja', isActive: true, code: 'T5NW7CJ3HE' },
      { id: 's-b2', name: 'Planta alta', isActive: true, code: 'F8RD4YK6PB' },
    ],
  },
]

const categories: ManagedCategory[] = [
  { id: 'k-1', name: 'Iluminación', severity: 'medium', isActive: true },
  { id: 'k-2', name: 'Red e internet', severity: 'medium', isActive: true },
  { id: 'k-3', name: 'Limpieza', severity: 'low', isActive: true },
  { id: 'k-4', name: 'Mobiliario', severity: 'low', isActive: true },
  { id: 'k-5', name: 'Jardinería', severity: 'low', isActive: false },
]

// RF-CATALOGO-20: everything, active or not, for the catalog screen.
export async function getManagedCatalog() {
  await delay()
  return { campus: CAMPUS, buildings: structuredClone(buildings), categories: structuredClone(categories) }
}

// SDD 10.8: trimmed, whitespace collapsed, 1 to 100 characters, unique in its scope
// ignoring case, accents and extra spaces (RF-CATALOGO-08).
function checkName(name: string, siblings: { id: string; name: string }[], id?: string) {
  const clean = cleanName(name)
  if (clean.length === 0) throw new ApiError('VALIDATION', 'Escribe un nombre.')
  if ([...clean].length > MAX_NAME_LENGTH) {
    throw new ApiError('VALIDATION', `El nombre puede tener hasta ${MAX_NAME_LENGTH} caracteres.`)
  }
  const key = nameKey(clean)
  if (siblings.some((s) => s.id !== id && nameKey(s.name) === key)) {
    throw new ApiError('DUPLICATE_NAME', `Ya existe "${clean}".`)
  }
  return clean
}

function findBuilding(id: string) {
  const building = buildings.find((b) => b.id === id)
  if (!building) throw new ApiError('NOT_FOUND', 'Ese edificio ya no existe.')
  return building
}

function findSpace(id: string) {
  for (const building of buildings) {
    const space = building.spaces.find((s) => s.id === id)
    if (space) return { building, space }
  }
  throw new ApiError('NOT_FOUND', 'Ese espacio ya no existe.')
}

function findCategory(id: string) {
  const category = categories.find((c) => c.id === id)
  if (!category) throw new ApiError('NOT_FOUND', 'Esa categoría ya no existe.')
  return category
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`

// Same alphabet and length as the server (SDD DD-15).
function newLinkCode() {
  const used = new Set(buildings.flatMap((b) => b.spaces.map((s) => s.code)))
  let code: string
  do {
    code = Array.from(
      crypto.getRandomValues(new Uint8Array(LINK_CODE_LENGTH)),
      (byte) => LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length],
    ).join('')
  } while (used.has(code))
  return code
}

export async function createBuilding(name: string) {
  await delay()
  const building: ManagedBuilding = {
    id: newId('b'),
    name: checkName(name, buildings),
    isActive: true,
    position: null,
    spaces: [],
  }
  buildings.push(building)
  return building
}

export async function renameBuilding(id: string, name: string) {
  await delay()
  const building = findBuilding(id)
  const previous = building.name
  building.name = checkName(name, buildings, id)
  for (const r of reports) if (r.building === previous) r.building = building.name
}

// RF-CATALOGO-09, 21: no deactivating a building or category with open reports.
export async function setBuildingActive(id: string, isActive: boolean) {
  await delay()
  const building = findBuilding(id)
  if (!isActive && reports.some((r) => r.building === building.name)) {
    throw new ApiError(
      'HAS_OPEN_REPORTS',
      `${building.name} tiene reportes abiertos. Resuélvelos o cancélalos antes de desactivarlo.`,
    )
  }
  building.isActive = isActive
}

// RF-CATALOGO-13, 19: set, move or remove (null) the position on the plan.
export async function setBuildingPosition(id: string, position: Position | null) {
  await delay()
  findBuilding(id).position = position
}

export async function createSpace(buildingId: string, name: string) {
  await delay()
  const building = findBuilding(buildingId)
  const space: ManagedSpace = {
    id: newId('s'),
    name: checkName(name, building.spaces),
    isActive: true,
    code: newLinkCode(),
  }
  building.spaces.push(space)
  return space
}

// RF-CATALOGO-15: renaming keeps the link code.
export async function renameSpace(id: string, name: string) {
  await delay()
  const { building, space } = findSpace(id)
  space.name = checkName(name, building.spaces, id)
}

export async function setSpaceActive(id: string, isActive: boolean) {
  await delay()
  findSpace(id).space.isActive = isActive
}

export async function createCategory(name: string, severity: Priority) {
  await delay()
  const category: ManagedCategory = {
    id: newId('k'),
    name: checkName(name, categories),
    severity,
    isActive: true,
  }
  categories.push(category)
  return category
}

export async function updateCategory(id: string, change: { name: string; severity: Priority }) {
  await delay()
  const category = findCategory(id)
  const previous = category.name
  category.name = checkName(change.name, categories, id)
  category.severity = change.severity
  for (const r of reports) if (r.category === previous) r.category = category.name
}

export async function setCategoryActive(id: string, isActive: boolean) {
  await delay()
  const category = findCategory(id)
  if (!isActive && reports.some((r) => r.category === category.name)) {
    throw new ApiError(
      'HAS_OPEN_REPORTS',
      `${category.name} tiene reportes abiertos. Resuélvelos o cancélalos antes de desactivarla.`,
    )
  }
  category.isActive = isActive
}

/* ---------- Roles (SDD 7.2, Acceso) ---------- */

export type RoleAccount = { email: string; role: StaffRole; hasSignedIn: boolean }

const roles: RoleAccount[] = [
  { email: 'coordinacion.sauzal@uabc.edu.mx', role: 'admin', hasSignedIn: true },
  { email: 'dir.sauzal@uabc.edu.mx', role: 'admin', hasSignedIn: false },
  { email: CURRENT_USER, role: 'staff', hasSignedIn: true },
  { email: 'carlos.ruiz@uabc.edu.mx', role: 'staff', hasSignedIn: true },
  { email: 'mariana.torres@uabc.edu.mx', role: 'staff', hasSignedIn: true },
  { email: 'jorge.salas@uabc.edu.mx', role: 'staff', hasSignedIn: true },
]

// RF-ACCESO-11
export async function listRoles() {
  await delay()
  return structuredClone(roles)
}

function hasAssignedOpenReports(email: string) {
  return reports.some((r) => r.assignee === email)
}

// RF-ACCESO-10: an active campus keeps at least one Admin who has signed in.
function checkAdminsAfter(next: RoleAccount[]) {
  if (!next.some((r) => r.role === 'admin' && r.hasSignedIn)) {
    throw new ApiError(
      'LAST_ADMIN',
      'El campus debe conservar al menos un Admin que ya haya iniciado sesión.',
    )
  }
}

// RF-ACCESO-06, 08, 09: by institutional email, signed in before or not.
export async function assignRole(email: string, role: string) {
  await delay()
  const parsed = assignRoleBody.safeParse({ email, role })
  if (!parsed.success) throw new ApiError('VALIDATION', parsed.error.issues[0].message)
  const current = roles.find((r) => r.email === parsed.data.email)
  if (current?.role === 'staff' && parsed.data.role === 'admin' && hasAssignedOpenReports(current.email)) {
    throw new ApiError(
      'HAS_ASSIGNED_REPORTS',
      `${current.email} tiene reportes abiertos asignados. Reasígnalos antes de cambiar su rol.`,
    )
  }
  const next = current
    ? roles.map((r) => (r === current ? { ...r, role: parsed.data.role } : r))
    : [...roles, { email: parsed.data.email, role: parsed.data.role, hasSignedIn: false }]
  checkAdminsAfter(next)
  roles.splice(0, roles.length, ...next)
}

// RF-ACCESO-07, 09, 10: the account goes back to Reportante.
export async function removeRole(email: string) {
  await delay()
  const current = roles.find((r) => r.email === email)
  if (!current) throw new ApiError('NOT_FOUND', 'Esa cuenta ya no tiene rol en el campus.')
  if (current.role === 'staff' && hasAssignedOpenReports(email)) {
    throw new ApiError(
      'HAS_ASSIGNED_REPORTS',
      `${email} tiene reportes abiertos asignados. Reasígnalos antes de retirar su rol.`,
    )
  }
  const next = roles.filter((r) => r !== current)
  checkAdminsAfter(next)
  roles.splice(0, roles.length, ...next)
}

/* ---------- Thresholds (RF-NOTIFICACION-14, RF-MAPA-22) ---------- */

export type AlertThresholds = { new: number | null; inReview: number | null }

let alertThresholds: AlertThresholds = { new: 5, inReview: null }
// RF-MAPA-10 example: Medio from 3, Alto from 6.
let mapThresholds: MapThresholds | null = { medium: 3, high: 6 }

export async function getThresholds() {
  await delay()
  return { alert: { ...alertThresholds }, map: mapThresholds && { ...mapThresholds } }
}

export async function setAlertThresholds(value: AlertThresholds) {
  await delay()
  const parsed = alertThresholdsBody.safeParse(value)
  if (!parsed.success) throw new ApiError('VALIDATION', parsed.error.issues[0].message)
  alertThresholds = parsed.data
}

export async function setMapThresholds(value: MapThresholds | null) {
  await delay()
  const parsed = mapThresholdsBody.safeParse(value)
  if (!parsed.success) throw new ApiError('VALIDATION', parsed.error.issues[0].message)
  mapThresholds = parsed.data
}

