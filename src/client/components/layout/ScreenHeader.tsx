import { Link } from 'react-router'
import { cn } from '../../lib/cn'
import { ArrowLeftIcon, ChevronLeftIcon } from '../ui/icons'

type ScreenHeaderProps = {
  title: string
  // Desktop ("· Escritorio" frames): a shorter title with a line under it.
  desktopTitle?: string
  subtitle?: string
  // Back arrow: a route to go to, or a handler for in-screen steps. No arrow when both are omitted.
  backTo?: string
  onBack?: () => void
  backLabel?: string
  // Section screens reached from the side menu have no back arrow on desktop.
  hideBackOnDesktop?: boolean
}

const backClasses =
  '-m-1 rounded-control p-1 focus-visible:outline-2 focus-visible:outline-neutral-white'

// Figma "Encabezado": green bar with an optional back arrow and the screen title.
// On desktop it is the 100 px page header of the "· Escritorio" frames.
export function ScreenHeader({
  title,
  desktopTitle,
  subtitle,
  backTo,
  onBack,
  backLabel = 'Volver',
  hideBackOnDesktop = false,
}: ScreenHeaderProps) {
  const arrow = (
    <>
      <ArrowLeftIcon className="size-5.5 lg:hidden" />
      <ChevronLeftIcon className="hidden size-6 lg:block" />
    </>
  )
  const short = desktopTitle ?? title
  const back = cn(backClasses, hideBackOnDesktop && 'lg:hidden')

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2.5 bg-green px-4.5 py-4 text-neutral-white lg:min-h-25 lg:gap-4 lg:px-10 lg:py-5">
      {backTo && (
        <Link to={backTo} aria-label={backLabel} className={back}>
          {arrow}
        </Link>
      )}
      {!backTo && onBack && (
        <button type="button" onClick={onBack} aria-label={backLabel} className={back}>
          {arrow}
        </button>
      )}
      <div className="flex flex-col gap-1">
        <h1 className="text-heading font-medium lg:text-[26px] lg:leading-tight lg:font-bold">
          {short === title ? (
            title
          ) : (
            <>
              <span className="lg:hidden">{title}</span>
              <span className="hidden lg:inline">{short}</span>
            </>
          )}
        </h1>
        {subtitle && <p className="hidden text-xs text-neutral-white/90 lg:block">{subtitle}</p>}
      </div>
    </header>
  )
}
