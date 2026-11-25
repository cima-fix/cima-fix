import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '../../lib/cn'

type DialogProps = {
  labelledBy: string
  describedBy?: string
  onClose: () => void
  // sheet: bottom sheet on phones (Figma frame C), centered from lg up.
  // modal: centered on every size (desktop modals of the "· Escritorio" frames).
  variant?: 'sheet' | 'modal'
  className?: string
  children: ReactNode
}

// Native modal <dialog>: traps focus, closes with Esc and restores focus (SDD 13.5).
// Rendered only while open.
export function Dialog({
  labelledBy,
  describedBy,
  onClose,
  variant = 'modal',
  className,
  children,
}: DialogProps) {
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialog.current
    if (element && !element.open) element.showModal()
  }, [])

  return (
    <dialog
      ref={dialog}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClose={onClose}
      className={cn(
        'w-full bg-neutral-white p-0 text-neutral-text backdrop:bg-neutral-black/50',
        variant === 'sheet'
          ? 'mx-auto mt-auto mb-0 max-w-md rounded-t-screen lg:my-auto lg:max-w-md lg:rounded-2xl'
          : 'm-auto max-w-[calc(100%-2rem)] rounded-2xl sm:max-w-md',
        className,
      )}
    >
      {children}
    </dialog>
  )
}
