import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { formatDateTime, plural } from '../../lib/format'
import { isOpen, type Report } from '../../lib/reports'
import { cn } from '../../lib/cn'
import { useSession } from '../../lib/session'
import { PriorityBadge, StatusBadge } from './Badge'

type Variant = 'compact' | 'list'

// RN-04: the assignee email only comes to the staff of the campus; without it nothing is said.
function assigneeText(report: Report, email: string) {
  if (report.assigneeEmail === undefined) return undefined
  if (report.assigneeEmail === null) return 'Sin asignar'
  return report.assigneeEmail === email ? 'Asignado a ti' : `Asignado a ${report.assigneeEmail}`
}

function metaText(report: Report, variant: Variant, email: string) {
  if (report.status === 'resolved' && report.resolvedAt) {
    return `Resuelto ${formatDateTime(report.resolvedAt)}`
  }
  const parts = [
    plural(report.confirmationCount, 'confirmación', 'confirmaciones'),
    formatDateTime(report.createdAt),
  ]
  const assignee = variant === 'list' && isOpen(report) ? assigneeText(report, email) : undefined
  if (assignee) parts.unshift(assignee)
  return parts.join(' · ')
}

type ReportCardProps = {
  report: Report
  // compact: duplicates/confirmation (space · category); list: report list (building · space).
  variant?: Variant
  // Extra line under the title (e.g. building and campus).
  location?: string
  href?: string
  children?: ReactNode
}

// Figma "Tarjeta reporte".
export function ReportCard({ report, variant = 'compact', location, href, children }: ReportCardProps) {
  const { email } = useSession()
  const title =
    variant === 'list'
      ? `${report.building.name} · ${report.space.name}`
      : `${report.space.name} · ${report.category.name}`
  const description =
    variant === 'list' ? `${report.category.name} · ${report.description}` : report.description

  return (
    <article
      className={cn(
        'relative flex flex-col gap-2 rounded-card border border-neutral-border p-3',
        isOpen(report) ? 'bg-neutral-white' : 'bg-neutral-surface',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-neutral-text">
          {href ? (
            // Stretched link: the whole card opens the report; actions sit above it.
            <Link to={href} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-green">
              {title}
            </Link>
          ) : (
            title
          )}
        </h3>
        <PriorityBadge priority={report.priority} />
      </div>
      {location && <p className="text-body text-neutral-text-secondary">{location}</p>}
      <p className="text-body text-neutral-text-secondary">{description}</p>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={report.status} />
        <span className="text-xs text-neutral-text-muted">{metaText(report, variant, email)}</span>
      </div>
      {children && <div className="relative mt-1 flex flex-col gap-2">{children}</div>}
    </article>
  )
}
