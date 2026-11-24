// Enums shared by the SPA and the API. Values are the ones the API sends (SDD 7.3).

export const REPORT_STATUSES = ['new', 'in_review', 'resolved', 'cancelled'] as const
export type ReportStatus = (typeof REPORT_STATUSES)[number]

// Open reports are the ones still being handled (SRS glossary).
export const OPEN_STATUSES = ['new', 'in_review'] as const satisfies readonly ReportStatus[]
export type OpenStatus = (typeof OPEN_STATUSES)[number]

// Scale of category severity and report priority, from lowest to highest (RF-CATALOGO-18,
// RF-PRIORIDAD-01).
export const LEVELS = ['low', 'medium', 'high'] as const
export type Level = (typeof LEVELS)[number]

// Roles held in a campus. "reporter" has no row in the database (SDD DD-06).
export const STAFF_ROLES = ['staff', 'admin'] as const
export type StaffRole = (typeof STAFF_ROLES)[number]
export type Role = 'reporter' | StaffRole

export type CampusId = string
