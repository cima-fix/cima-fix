// Report types and display rules shared by the report screens.
// They move to src/shared/ once the API exists (SDD DD-13, DD-14).

export type ReportStatus = 'new' | 'in_review' | 'resolved' | 'cancelled'
export type Priority = 'low' | 'medium' | 'high'

export type Report = {
  id: string
  campus: string
  building: string
  space: string
  category: string
  description: string
  status: ReportStatus
  priority: Priority
  confirmations: number
  createdAt: string
  resolvedAt?: string
  reporterEmail: string
  assignee?: string
  photoCount: number
  confirmedByMe?: boolean
  reportedByMe?: boolean
}

export const STATUS_LABEL: Record<ReportStatus, string> = {
  new: 'Nuevo',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  cancelled: 'Cancelado',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
}

export function isOpen(report: Report) {
  return report.status === 'new' || report.status === 'in_review'
}

const LEVELS: Priority[] = ['low', 'medium', 'high']

// RF-GESTION-14 (SDD 10.5): open first, then higher priority, then oldest, then id.
// Same order for the list, the possible duplicates (RF-DUPLICADO-07) and the map list (RF-MAPA-18).
export function compareReports(a: Report, b: Report) {
  return (
    Number(isOpen(b)) - Number(isOpen(a)) ||
    LEVELS.indexOf(b.priority) - LEVELS.indexOf(a.priority) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

export const MAX_DESCRIPTION = 1000

// SDD 10.8: trimmed, counted as code points (`[...text].length`), like varchar(1000).
export function descriptionLength(text: string) {
  return [...text.trim()].length
}

// RF-PRIORIDAD-02: category severity raised one level per 3 confirmations, capped at high.
export function computePriority(severity: Priority, confirmations: number): Priority {
  const level = LEVELS.indexOf(severity) + Math.floor(confirmations / 3)
  return LEVELS[Math.min(level, LEVELS.length - 1)]
}
