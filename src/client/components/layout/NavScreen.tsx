import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { ScreenHeader } from './ScreenHeader'

type NavScreenProps = {
  title: string
  desktopTitle?: string
  subtitle?: string
  children: ReactNode
}

// Screen with the bottom nav. The content scrolls inside <main>, between the header and
// the nav, so the nav never covers a button (WCAG 2.2 target size / focus not obscured).
// On desktop the bottom nav hides and the page scrolls as a whole.
export function NavScreen({ title, desktopTitle, subtitle, children }: NavScreenProps) {
  return (
    <div className="flex h-dvh flex-col lg:h-auto lg:min-h-dvh">
      <ScreenHeader
        title={title}
        desktopTitle={desktopTitle}
        subtitle={subtitle}
        backTo="/"
        backLabel="Volver al inicio"
        hideBackOnDesktop
      />
      <main className="flex-1 overflow-y-auto lg:overflow-visible">{children}</main>
      <BottomNav />
    </div>
  )
}
