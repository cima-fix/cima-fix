import type { ReactNode } from 'react'
import { BottomNav } from './BottomNav'
import { ScreenHeader } from './ScreenHeader'

// Screen with the bottom nav. The content scrolls inside <main>, between the header and
// the nav, so the nav never covers a button (WCAG 2.2 target size / focus not obscured).
export function NavScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <ScreenHeader title={title} backTo="/" backLabel="Volver al inicio" />
      <main className="flex-1 overflow-y-auto">{children}</main>
      <BottomNav />
    </div>
  )
}
