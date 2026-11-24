import { useSyncExternalStore } from 'react'

// Tailwind's `lg` breakpoint (64rem, 1024px): where the desktop layout starts.
export const DESKTOP_QUERY = '(min-width: 64rem)'

// For loaders, which run outside React. False where there is no window (unit tests).
export function matchesMedia(query: string) {
  return typeof window !== 'undefined' && window.matchMedia(query).matches
}

// Re-renders when the query starts or stops matching (resizing the window, rotating).
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}
