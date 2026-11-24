import { Outlet } from 'react-router'
import { SideNav } from './SideNav'

// Frame shared by every screen (SDD 13.1).
// Phone: full width, a centered phone-sized column on wider screens (max-w-md).
// Desktop (lg, 1024px and up): side menu on the left and the page filling the rest.
export function AppShell() {
  return (
    <div className="lg:flex lg:min-h-dvh">
      <SideNav />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-neutral-white sm:border-x sm:border-neutral-border lg:mx-0 lg:max-w-none lg:min-w-0 lg:flex-1 lg:border-x-0">
        <Outlet />
      </div>
    </div>
  )
}
