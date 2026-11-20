import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type ReportStatus } from '../../lib/reports'
import { ChevronUpIcon, ChevronsUpIcon, MinusIcon } from './icons'

type BadgeProps = { className?: string; children: ReactNode }

function Badge({ className, children }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.75 rounded-chip px-2.25 py-0.75 text-xs font-medium whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

// Figma: Chip/Nuevo, Chip/En revisión, Chip Resuelto.
const statusStyle: Record<ReportStatus, string> = {
  new: 'border border-blue bg-status-new-bg text-blue',
  in_review: 'border border-gold-dark bg-status-review-bg text-neutral-black',
  resolved: 'border border-green bg-green-surface text-green-dark',
  cancelled: 'border border-neutral-border bg-neutral-disabled text-neutral-text-muted',
}

export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  return <Badge className={cn(statusStyle[status], className)}>{STATUS_LABEL[status]}</Badge>
}

// Figma: Chip/Alta, Chip/Media, Chip Baja.
const priorityStyle: Record<Priority, string> = {
  high: 'bg-gold text-neutral-black',
  medium: 'bg-yellow text-neutral-black',
  low: 'bg-green-light text-neutral-black',
}

const priorityIcon: Record<Priority, typeof ChevronUpIcon> = {
  high: ChevronsUpIcon,
  medium: ChevronUpIcon,
  low: MinusIcon,
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = priorityIcon[priority]
  return (
    <Badge className={cn(priorityStyle[priority], className)}>
      <Icon className="size-3" strokeWidth={3} />
      <span>
        <span className="sr-only">Prioridad </span>
        {PRIORITY_LABEL[priority]}
      </span>
    </Badge>
  )
}

// Map level chips (Bajo / Medio / Alto) share the priority colors.
export function LevelBadge({ level, children }: { level: Priority; children: ReactNode }) {
  return <Badge className={cn(priorityStyle[level], 'px-2 text-caption')}>{children}</Badge>
}
