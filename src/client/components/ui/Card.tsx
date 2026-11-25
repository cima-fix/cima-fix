import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../lib/cn'

type Props = HTMLAttributes<HTMLElement> & { as?: ElementType; children: ReactNode }

// White card of the "· Escritorio" frames (12 px corners, light border). Other attributes
// (aria-label, aria-labelledby…) go to the element.
export function Card({ as: Tag = 'div', className, ...props }: Props) {
  return <Tag className={cn('rounded-xl border border-card-border bg-neutral-white', className)} {...props} />
}

// Small uppercase label above a group ("PARA ATENDER", "ACCESOS RÁPIDOS").
export function SectionLabel({ as: Tag = 'h2', className, ...props }: Props) {
  return (
    <Tag
      className={cn(
        'text-caption font-semibold tracking-wide text-neutral-text-muted uppercase',
        className,
      )}
      {...props}
    />
  )
}
