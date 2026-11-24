import type { ReportStatus } from '../types/common'
import type { LevelValue } from './levels'
import { isOpen } from './transitions'

export type OrderFacts = {
  id: string
  status: ReportStatus
  priority: LevelValue
  createdAt: Date
}

// RF-GESTION-14 (SDD 10.5): open reports first, then higher priority, then oldest; the id breaks
// ties so that the order is stable. Same order as the SQL of the report queries:
// `ORDER BY is_open DESC, priority DESC, created_at ASC, id ASC`. Also used for the possible
// duplicates (RF-DUPLICADO-07) and the list of a building on the map (RF-MAPA-18).
export function compareReports(a: OrderFacts, b: OrderFacts): number {
  return (
    Number(isOpen(b.status)) - Number(isOpen(a.status)) ||
    b.priority - a.priority ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    compareIds(a.id, b.id)
  )
}

// PostgreSQL compares uuid values byte by byte, which for the lowercase text form is the same
// as comparing the strings character by character.
function compareIds(a: string, b: string): number {
  const left = a.toLowerCase()
  const right = b.toLowerCase()
  if (left < right) return -1
  if (left > right) return 1
  return 0
}
