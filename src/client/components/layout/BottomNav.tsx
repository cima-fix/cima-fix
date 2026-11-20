import { NavLink } from 'react-router'
import { cn } from '../../lib/cn'
import { ListIcon, MapIcon } from '../ui/icons'

const items = [
  { to: '/reportes', label: 'Reportes', Icon: ListIcon },
  { to: '/mapa', label: 'Mapa', Icon: MapIcon },
]

// Figma "Bottom nav" for the staff screens.
export function BottomNav() {
  return (
    <nav
      aria-label="Secciones"
      className="flex shrink-0 border-t border-neutral-border bg-neutral-white"
    >
      {items.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-1 flex-col items-center gap-1 border-t-2 py-2.5 text-caption focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-green',
              isActive
                ? 'border-green font-medium text-green'
                : 'border-transparent text-neutral-text-secondary',
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
