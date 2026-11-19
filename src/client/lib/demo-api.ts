import { computePriority, isOpen, type Priority, type Report } from './reports'

/*
  In-memory stand-in for the Hono API (SDD 7) so the screens can be built
  before the backend exists. Same function shapes the typed client will
  expose; swap the bodies for `api.*` calls later. Data resets on reload.
*/

export const CURRENT_USER = 'tu.cuenta@uabc.edu.mx'

export type ApiErrorCode = 'SPACE_UNAVAILABLE' | 'RATE_LIMITED' | 'NOT_FOUND'

export class ApiError extends Error {
  readonly code: ApiErrorCode

  constructor(code: ApiErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export type Catalog = {
  campuses: string[]
  buildings: { name: string; spaces: string[] }[]
  categories: { name: string; severity: Priority }[]
  staff: string[]
}

const catalog: Catalog = {
  campuses: ['Campus Sauzal'],
  buildings: [
    { name: 'Edificio 2', spaces: ['Laboratorio 3', 'Salón 201'] },
    { name: 'Edificio 5', spaces: ['Salón 112', 'Salón 204'] },
    { name: 'Biblioteca', spaces: ['Planta baja', 'Planta alta'] },
  ],
  categories: [
    { name: 'Iluminación', severity: 'medium' },
    { name: 'Red e internet', severity: 'medium' },
    { name: 'Limpieza', severity: 'low' },
    { name: 'Mobiliario', severity: 'low' },
  ],
  staff: [CURRENT_USER, 'encargado.uno@uabc.edu.mx', 'encargado.dos@uabc.edu.mx'],
}

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
    reporterEmail: 'nombre.apellido@uabc.edu.mx',
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
    reporterEmail: 'nombre.apellido@uabc.edu.mx',
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
    assignee: 'encargado.uno@uabc.edu.mx',
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
]

// Fake latency so loading states are visible during development.
const delay = () => new Promise((resolve) => setTimeout(resolve, 150))

export async function getCatalog() {
  await delay()
  return catalog
}

export async function listReports() {
  await delay()
  return [...reports].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
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

// RN-05: open reports of the same campus, category and building.
export async function findSimilarReports(draft: ReportDraft) {
  await delay()
  return reports.filter(
    (r) =>
      isOpen(r) &&
      r.campus === draft.campus &&
      r.category === draft.category &&
      r.building === draft.building,
  )
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
  const building = catalog.buildings.find((b) => b.name === draft.building)
  if (!building?.spaces.includes(draft.space)) {
    throw new ApiError('SPACE_UNAVAILABLE', 'Ese espacio ya no está disponible. Elige otro.')
  }
  const severity = catalog.categories.find((c) => c.name === draft.category)?.severity ?? 'low'
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
    r.confirmations += 1
    r.confirmedByMe = true
    const severity = catalog.categories.find((c) => c.name === r.category)?.severity ?? 'low'
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

export type MapLevel = 'low' | 'medium' | 'high'

export type MapBuilding = {
  name: string
  openReports: number
  level: MapLevel
  // Position on the campus plan, as a percentage of its width and height.
  x: number
  y: number
}

// Campus map thresholds (RN-08): Medio from 3, Alto from 6.
export const MAP_THRESHOLDS = { medium: 3, high: 6 }

export function mapLevel(openReports: number): MapLevel {
  if (openReports >= MAP_THRESHOLDS.high) return 'high'
  if (openReports >= MAP_THRESHOLDS.medium) return 'medium'
  return 'low'
}

// Plan positions and counts mirror the Figma mock-up until the API exists.
export async function getCampusMap() {
  await delay()
  const buildings = [
    { name: 'Edificio 5', openReports: 7, x: 74, y: 72 },
    { name: 'Edificio 2', openReports: 4, x: 58, y: 24 },
    { name: 'Biblioteca', openReports: 2, x: 22, y: 24 },
    { name: 'Cafetería', openReports: 0, x: 34, y: 70 },
  ]
  return buildings.map((b) => ({ ...b, level: mapLevel(b.openReports) }) satisfies MapBuilding)
}
