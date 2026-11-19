import { Outlet } from 'react-router'

// Mobile-first frame shared by every screen (SDD 13.1): full width on a phone,
// a centered phone-sized column on wider screens.
export function AppShell() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-neutral-white sm:border-x sm:border-neutral-border">
      <Outlet />
    </div>
  )
}
