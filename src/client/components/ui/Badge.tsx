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
        // Desktop chips of the "· Escritorio" frames: soft pill, no border.
        'lg:rounded-pill lg:border-0 lg:px-2.5 lg:py-1 lg:font-semibold',
        className,
      )}
    >
      {children}
    </span>
  )
}

// Figma: Chip/Nuevo, Chip/En revisión, Chip Resuelto. Desktop: the soft chips of the
// "· Escritorio" frames.
const statusStyle: Record<ReportStatus, string> = {
  new: 'border border-blue bg-status-new-bg text-blue',
  in_review: 'border border-gold-dark bg-status-review-bg text-neutral-black lg:text-gold-text',
  resolved: 'border border-green bg-green-surface text-green-dark',
  cancelled: 'border border-neutral-border bg-neutral-disabled text-neutral-text-muted',
}

export function StatusBadge({ status, className }: { status: ReportStatus; className?: string }) {
  return <Badge className={cn(statusStyle[status], className)}>{STATUS_LABEL[status]}</Badge>
}

// Figma: Chip/Alta, Chip/Media, Chip Baja.
const levelStyle: Record<Priority, string> = {
  high: 'bg-gold text-neutral-black',
  medium: 'bg-yellow text-neutral-black',
  low: 'bg-green-light text-neutral-black',
}

// Desktop: "Prioridad alta / media / baja" soft chips.
const priorityStyle: Record<Priority, string> = {
  high: `${levelStyle.high} lg:bg-status-error-bg lg:text-status-error`,
  medium: `${levelStyle.medium} lg:bg-status-review-bg lg:text-gold-text`,
  low: `${levelStyle.low} lg:bg-green-surface lg:text-green-dark`,
}

const priorityIcon: Record<Priority, typeof ChevronUpIcon> = {
  high: ChevronsUpIcon,
  medium: ChevronUpIcon,
  low: MinusIcon,
}

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = priorityIcon[priority]
  const label = PRIORITY_LABEL[priority]
  return (
    <Badge className={cn(priorityStyle[priority], className)}>
      <Icon className="size-3 lg:hidden" strokeWidth={3} />
      <span className="lg:hidden">
        <span className="sr-only">Prioridad </span>
        {label}
      </span>
      <span className="hidden lg:inline">Prioridad {label.toLowerCase()}</span>
    </Badge>
  )
}

// Map level chips (Bajo / Medio / Alto) share the phone priority colors.
export function LevelBadge({ level, children }: { level: Priority; children: ReactNode }) {
  return (
    <Badge className={cn(levelStyle[level], 'px-2 text-caption lg:rounded-chip lg:px-2 lg:py-0.75')}>
      {children}
    </Badge>
  )
}

// Plain soft chip of the desktop frames (roles on Personal, "Desactivado" on Catálogo).
const toneStyle = {
  blue: 'bg-status-new-bg text-blue',
  green: 'bg-green-surface text-green-dark',
  gray: 'bg-neutral-disabled text-neutral-text-muted',
  // "Tú" in the assign modal.
  solid: 'bg-green text-neutral-white',
} as const

export function Chip({ tone, children }: { tone: keyof typeof toneStyle; children: ReactNode }) {
  return <Badge className={cn('rounded-pill font-semibold', toneStyle[tone])}>{children}</Badge>
}
