import type { ButtonHTMLAttributes } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'outline' | 'danger' | 'destructive' | 'muted'
type Size = 'md' | 'sm'

const base =
  'flex w-full items-center justify-center gap-2 rounded-control px-3 text-center font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:cursor-not-allowed'

// Figma components: Boton/primario, Boton/secundario, Boton/deshabilitado.
const variants: Record<Variant, string> = {
  primary:
    'bg-green text-neutral-white hover:bg-green-dark disabled:bg-neutral-disabled disabled:text-neutral-text-muted',
  // Figma uses a 1.5px border here.
  secondary:
    'border-[1.5px] border-green bg-neutral-white text-green-dark hover:bg-green-surface',
  outline: 'border border-neutral-text bg-neutral-white text-neutral-text hover:bg-neutral-surface',
  // Destructive action (cancel a report), uses the estado/error color.
  danger:
    'border-[1.5px] border-status-error bg-neutral-white text-status-error hover:bg-neutral-surface',
  // Confirming the destructive action ("Sí, cancelar reporte" in the cancel modal).
  destructive: 'bg-status-error text-neutral-white hover:bg-status-error/90',
  muted: 'border border-neutral-border bg-neutral-disabled text-neutral-text-muted',
}

const sizes: Record<Size, string> = {
  md: 'py-3.25 text-control',
  sm: 'py-2 text-sm',
}

type StyleProps = { variant?: Variant; size?: Size; className?: string }

function classes({ variant = 'primary', size = 'md', className }: StyleProps) {
  return cn(base, variants[variant], sizes[size], className)
}

export function Button({
  variant,
  size,
  className,
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & StyleProps) {
  return <button type={type} className={classes({ variant, size, className })} {...props} />
}

// Looks like the disabled button (Boton/deshabilitado) but is plain text: for a
// state the person cannot act on, such as "Ya lo confirmaste".
export function ButtonNote({ className, children }: { className?: string; children: string }) {
  return <p className={classes({ variant: 'muted', className })}>{children}</p>
}

export function ButtonLink({ variant, size, className, ...props }: LinkProps & StyleProps) {
  return <Link className={classes({ variant, size, className })} {...props} />
}
