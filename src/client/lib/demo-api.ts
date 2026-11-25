import { cleanName, nameKey } from '../../shared/domain/names.ts'
import { offeredCatalog } from '../../shared/domain/offered-catalog.ts'
import { can, type CampusRoles, type Permission } from '../../shared/domain/permissions.ts'
import { resolveSpaceLink } from '../../shared/domain/space-link.ts'
import { buildingLevel, type MapThresholds } from '../../shared/domain/map-levels.ts'
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH } from '../../shared/domain/link-code.ts'
import { MAX_NAME_LENGTH } from '../../shared/domain/limits.ts'
import { assignRoleBody } from '../../shared/schemas/access.ts'
import { alertThresholdsBody, mapThresholdsBody } from '../../shared/schemas/thresholds.ts'
import type { StaffRole } from '../../shared/types/common.ts'
import { compareReports, computePriority, isOpen, type Priority, type Report } from './reports'

/*
  In-memory stand-in for the Hono API (SDD 7) so the screens can be built
  before the client is wired to it. Same function shapes the typed client will
  expose; swap the bodies for `api.*` calls later. Data resets on reload, except
  the demo session, which is kept in localStorage.
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

/* ---------- Session (SDD 8.1) ---------- */

export type Session = { email: string; role: StaffRole }

const SESSION_KEY = 'cima-fix.demo-session'
// The demo starts signed in as the Encargado of the Figma frames, so every screen opens
// directly; "Cerrar sesión" leads to /ingresar.
const DEFAULT_SESSION: Session = { email: CURRENT_USER, role: 'staff' }

function storage() {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function getSession(): Session | null {
  const stored = storage()?.getItem(SESSION_KEY)
  if (stored === undefined || stored === null) return DEFAULT_SESSION
  return JSON.parse(stored) as Session | null
}

// Stand-in for POST /api/auth/google: the demo picks the role instead of Google.
export async function signIn(role: StaffRole) {
  await delay()
  const session: Session = { email: CURRENT_USER, role }
  storage()?.setItem(SESSION_KEY, JSON.stringify(session))
  const account = roles.find((r) => r.email === CURRENT_USER)
  if (account) account.role = role
  return session
}

export async function signOut() {
  await delay()
  storage()?.setItem(SESSION_KEY, 'null')
}

// RN-01/RN-03 through the shared permission matrix, for the demo campus.
export function sessionCan(session: Session | null, permission: Permission) {
  const campusRoles: CampusRoles = new Map(session ? [[CAMPUS.id, session.role]] : [])
  return can(campusRoles, permission, CAMPUS.id)
}

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

// What the report form offers (RF-CATALOGO-10), by name.
export type Catalog = {
  campuses: string[]
  buildings: { name: string; spaces: string[] }[]
  categories: { name: string; severity: Priority }[]
  // Encargados of the campus: the people a report can be assigned to.
  staff: string[]
}

function offered() {
  return offeredCatalog({ campus: { id: CAMPUS.id, isActive: true }, buildings, categories })
}

export async function getCatalog(): Promise<Catalog> {
  await delay()
  const catalog = offered()
  return {
    campuses: [CAMPUS.name],
    buildings: (catalog?.buildings ?? []).map((b) => ({
      name: b.name,
      spaces: b.spaces.map((s) => s.name),
    })),
    categories: (catalog?.categories ?? []).map(({ name, severity }) => ({ name, severity })),
    staff: roles.filter((r) => r.role === 'staff').map((r) => r.email),
  }
}

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
  // Reports keep pointing at the building (RF-CATALOGO-11); here they store the name.
  for (const r of reports) if (r.building === previous) r.building = building.name
}

// RF-CATALOGO-09, 21: no deactivating a building or category with open reports.
export async function setBuildingActive(id: string, isActive: boolean) {
  await delay()
  const building = findBuilding(id)
  if (!isActive && reports.some((r) => isOpen(r) && r.building === building.name)) {
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
  const previous = space.name
  space.name = checkName(name, building.spaces, id)
  for (const r of reports) {
    if (r.building === building.name && r.space === previous) r.space = space.name
  }
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
  if (!isActive && reports.some((r) => isOpen(r) && r.category === category.name)) {
    throw new ApiError(
      'HAS_OPEN_REPORTS',
      `${category.name} tiene reportes abiertos. Resuélvelos o cancélalos antes de desactivarla.`,
    )
  }
  category.isActive = isActive
}

/* ---------- Space links (SDD 10.9) ---------- */

export type SpaceLinkResult = {
  campus?: string
  building?: string
  space?: string
  unavailable: boolean
}

// GET /api/links/:code, mapped to names for the form.
export async function resolveSpaceCode(code: string): Promise<SpaceLinkResult> {
  await delay()
  const building = buildings.find((b) => b.spaces.some((s) => s.code === code.toUpperCase()))
  const space = building?.spaces.find((s) => s.code === code.toUpperCase())
  const target = building && space ? { campusId: CAMPUS.id, buildingId: building.id, spaceId: space.id } : null
  const { preselect, unavailable } = resolveSpaceLink(target, {
    campus: { id: CAMPUS.id, isActive: true },
    buildings,
    categories,
  })
  return {
    campus: preselect.campusId ? CAMPUS.name : undefined,
    building: preselect.buildingId ? building?.name : undefined,
    space: preselect.spaceId ? space?.name : undefined,
    unavailable,
  }
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
  return reports.some((r) => isOpen(r) && r.assignee === email)
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

/* ---------- Reports ---------- */

const reports: Report[] = [
  {
    id: 'r-1',
    campus: 'Campus Sauzal',
    building: 'Edificio 5',
    space: 'Salón 204',
    category: 'Iluminación',
    description: 'No enciende la lámpara de la izquierda.',
    status: 'new',
    priority: 'high',
    confirmations: 6,
    createdAt: '2026-11-16T18:32:00Z',
    reporterEmail: 'ana.lopez@uabc.edu.mx',
    photoCount: 1,
  },
  {
    id: 'r-2',
    campus: 'Campus Sauzal',
    building: 'Edificio 2',
    space: 'Laboratorio 3',
    category: 'Red e internet',
    description: 'Sin conexión en los equipos del fondo desde el miércoles.',
    status: 'in_review',
    priority: 'medium',
    confirmations: 2,
    createdAt: '2026-11-12T16:10:00Z',
    reporterEmail: 'ana.lopez@uabc.edu.mx',
    assignee: CURRENT_USER,
    photoCount: 2,
  },
  {
    id: 'r-3',
    campus: 'Campus Sauzal',
    building: 'Edificio 5',
    space: 'Salón 112',
    category: 'Iluminación',
    description: 'La lámpara del fondo no enciende desde el lunes.',
    status: 'new',
    priority: 'high',
    confirmations: 4,
    createdAt: '2026-11-10T17:15:00Z',
    reporterEmail: 'otra.persona@uabc.edu.mx',
    photoCount: 0,
  },
  {
    id: 'r-4',
    campus: 'Campus Sauzal',
    building: 'Edificio 5',
    space: 'Salón 204',
    category: 'Iluminación',
    description: 'Parpadea la luz del pizarrón.',
    status: 'in_review',
    priority: 'medium',
    confirmations: 1,
    createdAt: '2026-11-13T00:40:00Z',
    reporterEmail: 'otra.persona@uabc.edu.mx',
    assignee: 'carlos.ruiz@uabc.edu.mx',
    photoCount: 0,
    confirmedByMe: true,
  },
  {
    id: 'r-5',
    campus: 'Campus Sauzal',
    building: 'Biblioteca',
    space: 'Planta baja',
    category: 'Limpieza',
    description: 'Derrame en el pasillo.',
    status: 'resolved',
    priority: 'low',
    confirmations: 0,
    createdAt: '2026-11-14T16:20:00Z',
    resolvedAt: '2026-11-14T21:05:00Z',
    reporterEmail: CURRENT_USER,
    reportedByMe: true,
    photoCount: 0,
  },
  {
    // Open report of the current account: shows up as a possible duplicate without
    // the confirm button (RF-DUPLICADO-05).
    id: 'r-6',
    campus: 'Campus Sauzal',
    building: 'Edificio 5',
    space: 'Salón 112',
    category: 'Iluminación',
    description: 'El apagador de la entrada no funciona.',
    status: 'new',
    priority: 'medium',
    confirmations: 0,
    createdAt: '2026-11-17T17:00:00Z',
    reporterEmail: CURRENT_USER,
    reportedByMe: true,
    photoCount: 0,
  },
]

export async function listReports() {
  await delay()
  return [...reports].sort(compareReports)
}

export async function getReport(id: string) {
  await delay()
  const report = reports.find((r) => r.id === id)
  if (!report) throw new ApiError('NOT_FOUND', 'Este reporte no existe o ya no está disponible.')
  return report
}

export type ReportDraft = {
  campus: string
  building: string
  space: string
  category: string
  description: string
  photoCount: number
}

// RN-05: open reports of the same campus, category and building, in the
// RF-GESTION-14 order (RF-DUPLICADO-07).
export async function findSimilarReports(draft: ReportDraft) {
  await delay()
  return reports
    .filter(
      (r) =>
        isOpen(r) &&
        r.campus === draft.campus &&
        r.category === draft.category &&
        r.building === draft.building,
    )
    .sort(compareReports)
}

const RATE_LIMIT_PER_HOUR = 10
const createdAt: number[] = []

export async function createReport(draft: ReportDraft) {
  await delay()
  const hourAgo = Date.now() - 60 * 60 * 1000
  if (createdAt.filter((t) => t > hourAgo).length >= RATE_LIMIT_PER_HOUR) {
    throw new ApiError(
      'RATE_LIMITED',
      `Llegaste al límite de ${RATE_LIMIT_PER_HOUR} reportes por hora. Intenta más tarde.`,
    )
  }
  const building = offered()?.buildings.find((b) => b.name === draft.building)
  if (!building?.spaces.some((s) => s.name === draft.space)) {
    throw new ApiError('SPACE_UNAVAILABLE', 'Ese espacio ya no está disponible. Elige otro.')
  }
  const severity = categories.find((c) => c.name === draft.category)?.severity ?? 'low'
  const report: Report = {
    ...draft,
    id: crypto.randomUUID(),
    status: 'new',
    priority: computePriority(severity, 0),
    confirmations: 0,
    createdAt: new Date().toISOString(),
    reporterEmail: CURRENT_USER,
    reportedByMe: true,
  }
  createdAt.push(Date.now())
  reports.push(report)
  return report
}

function update(id: string, change: (report: Report) => void) {
  const report = reports.find((r) => r.id === id)
  if (!report) throw new ApiError('NOT_FOUND', 'Este reporte no existe o ya no está disponible.')
  change(report)
  return report
}

export async function confirmReport(id: string) {
  await delay()
  return update(id, (r) => {
    // RF-DUPLICADO-05: not your own report, and only once per account.
    if (r.reportedByMe) {
      throw new ApiError('OWN_REPORT', 'No puedes confirmar un reporte que tú registraste.')
    }
    if (r.confirmedByMe) {
      throw new ApiError('ALREADY_CONFIRMED', 'Ya confirmaste este reporte.')
    }
    r.confirmations += 1
    r.confirmedByMe = true
    const severity = categories.find((c) => c.name === r.category)?.severity ?? 'low'
    r.priority = computePriority(severity, r.confirmations)
  })
}

export async function assignReport(id: string, assignee: string) {
  await delay()
  return update(id, (r) => {
    r.assignee = assignee
    r.status = 'in_review'
  })
}

export async function resolveReport(id: string) {
  await delay()
  return update(id, (r) => {
    r.status = 'resolved'
    r.resolvedAt = new Date().toISOString()
  })
}

export async function cancelReport(id: string) {
  await delay()
  return update(id, (r) => {
    r.status = 'cancelled'
  })
}

/* ---------- Campus map (SDD 13.4) ---------- */

export type MapLevel = 'low' | 'medium' | 'high'

export type MapBuilding = {
  name: string
  openReports: number
  // Null when the campus has no map thresholds (RF-MAPA-09).
  level: MapLevel | null
  // Null for a building without a position on the plan (RF-CATALOGO-17).
  position: Position | null
}

// RF-MAPA-08: the count is the number of open reports of the building;
// Resueltos and Cancelados are not counted.
export async function getCampusMap() {
  await delay()
  return {
    thresholds: mapThresholds && { ...mapThresholds },
    buildings: buildings
      .filter((b) => b.isActive)
      .map((b) => {
        const openReports = reports.filter((r) => r.building === b.name && isOpen(r)).length
        return {
          name: b.name,
          openReports,
          level: buildingLevel(openReports, mapThresholds),
          position: b.position && { ...b.position },
        } satisfies MapBuilding
      }),
  }
}
