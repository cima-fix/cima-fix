import { useId, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn'
import { ChevronDownIcon } from './icons'

type FieldProps = {
  label: string
  error?: string
  // Extra line under the control that is not an error (counter, hint).
  hint?: ReactNode
  hintAlign?: 'start' | 'end'
  className?: string
  children: (control: { id: string; describedBy?: string; invalid: boolean }) => ReactNode
}

// Label + control + hint/error, wired with aria-describedby (SDD 13.5).
export function Field({ label, error, hint, hintAlign = 'start', className, children }: FieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hintId = `${id}-hint`
  const describedBy = [error && errorId, hint && hintId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-body text-neutral-text-secondary">
        {label}
      </label>
      {children({ id, describedBy, invalid: Boolean(error) })}
      {error && (
        <p id={errorId} className="text-xs text-status-error">
          {error}
        </p>
      )}
      {hint && (
        <p
          id={hintId}
          className={cn('text-xs text-neutral-text-muted', hintAlign === 'end' && 'text-right')}
        >
          {hint}
        </p>
      )}
    </div>
  )
}

const control =
  'w-full rounded-control border bg-neutral-white px-3 text-control text-neutral-text outline-none focus-visible:ring-2 focus-visible:ring-green/40'

function borderFor(invalid: boolean | undefined) {
  return invalid
    ? 'border-2 border-status-error'
    : 'border-neutral-field-border focus-visible:border-green'
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & {
  invalid?: boolean
  placeholder?: string
  options: string[]
  // sm: compact filter selects on the report list (Figma frame A).
  size?: 'md' | 'sm'
}

export function Select({
  invalid,
  placeholder,
  options,
  size = 'md',
  className,
  value,
  ...props
}: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        value={value}
        className={cn(
          control,
          borderFor(invalid),
          'appearance-none',
          size === 'md' ? 'py-2.75 pr-10' : 'py-2 pr-8 text-xs',
          value === '' && 'text-neutral-text-muted',
          className,
        )}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option} value={option} className="text-neutral-text">
            {option}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        className={cn(
          'pointer-events-none absolute top-1/2 -translate-y-1/2 text-neutral-text-secondary',
          size === 'md' ? 'right-3 size-5' : 'right-2.5 size-4',
        )}
      />
    </div>
  )
}

export function Textarea({
  invalid,
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(
        control,
        borderFor(invalid),
        'min-h-18.5 resize-y py-2.75 placeholder:text-neutral-text-muted',
        className,
      )}
      {...props}
    />
  )
}
