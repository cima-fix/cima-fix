import { Link } from 'react-router'
import { ArrowLeftIcon } from '../ui/icons'

type ScreenHeaderProps = {
  title: string
  // Back arrow: a route to go to, or a handler for in-screen steps. No arrow when both are omitted.
  backTo?: string
  onBack?: () => void
  backLabel?: string
}

const backClasses =
  '-m-1 rounded-control p-1 focus-visible:outline-2 focus-visible:outline-neutral-white'

// Figma "Encabezado": green bar with an optional back arrow and the screen title.
export function ScreenHeader({ title, backTo, onBack, backLabel = 'Volver' }: ScreenHeaderProps) {
  const arrow = <ArrowLeftIcon className="size-5.5" />

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-green px-4.5 py-4 text-neutral-white">
      {backTo && (
        <Link to={backTo} aria-label={backLabel} className={backClasses}>
          {arrow}
        </Link>
      )}
      {!backTo && onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel} className={backClasses}>
          {arrow}
        </button>
      )}
      <h1 className="text-heading font-medium">{title}</h1>
    </header>
  )
}
