import { Outlet } from 'react-router'

// Shared frame for every screen: green top bar + the active screen below.
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-neutral-white">
      <header className="bg-green px-4 py-3 text-neutral-white">
        <p className="text-lg font-semibold">Cima Fix</p>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 p-4">
        <Outlet />
      </main>
    </div>
  )
}