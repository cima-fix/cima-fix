import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'
import { AlertCircleIcon, InfoIcon } from './icons'

type Tone = 'info' | 'warning' | 'error'

// Figma "Aviso" component.
const tones: Record<Tone, string> = {
  info: 'bg-status-new-bg text-blue',
  warning: 'border border-gold-dark bg-status-review-bg text-neutral-text',
  error: 'bg-status-error text-neutral-white',
}

export function Notice({
  tone,
  children,
  className,
}: {
  tone: Tone
  children: ReactNode
  className?: string
}) {
  const Icon = tone === 'info' ? InfoIcon : AlertCircleIcon
  return (
    <div
      role={tone === 'info' ? undefined : 'alert'}
      className={cn('flex gap-1.5 rounded-control px-3 py-2.5 text-xs', tones[tone], className)}
    >
      <Icon className="mt-px size-3.5 shrink-0" />
      <p>{children}</p>
    </div>
  )
}
