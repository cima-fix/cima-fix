import type { InferResponseType } from 'hono/client'
import { LEVELS } from '../../shared/types/common.ts'
import { api } from '../api'

// A report as the API sends it (SDD 7.3, ReportView): the only shape the screens use. The
// reporter and assignee emails are absent when the account may not see them (RN-04).
export type Report = InferResponseType<(typeof api.reports)[':id']['$get'], 200>
export type ReportStatus = Report['status']
export type Priority = Report['priority']

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

export function isOpen(report: Pick<Report, 'status'>) {
  return report.status === 'new' || report.status === 'in_review'
}

// RF-GESTION-14 (SDD 10.5): open first, then higher priority, then oldest, then id. The API
// already sends every list in this order; the SPA uses it only to merge two lists (Inicio).
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
