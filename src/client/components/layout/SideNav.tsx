import { NavLink } from 'react-router'
import { cn } from '../../lib/cn'
import { CURRENT_USER } from '../../lib/demo-api'
import { HomeIcon, ListIcon, MapIcon, PlusIcon } from '../ui/icons'

const items = [
  { to: '/', label: 'Inicio', end: true, Icon: HomeIcon },
  { to: '/reportar', label: 'Reportar un problema', end: false, Icon: PlusIcon },
  { to: '/reportes', label: 'Reportes', end: false, Icon: ListIcon },
  { to: '/mapa', label: 'Mapa del campus', end: false, Icon: MapIcon },
]

// Desktop version of the navigation: a side menu. It only shows from `lg` up
// (`hidden lg:flex`); on phones the BottomNav is used instead.
export function SideNav() {
  return (
    <nav
      aria-label="Principal"
      className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-1 bg-green-dark p-4 text-neutral-white lg:flex"
    >
      <p className="px-3 pt-2 pb-6 text-heading font-medium">Cima Fix</p>
      {items.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-3 rounded-control px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-neutral-white',
              isActive ? 'bg-green font-medium' : 'text-neutral-white/80 hover:bg-green/60',
            )
          }
        >
          <Icon className="size-5" />
          {label}
        </NavLink>
      ))}
      <p className="mt-auto border-t border-neutral-white/20 px-3 pt-4 text-xs break-all text-neutral-white/70">
        {CURRENT_USER}
      </p>
    </nav>
  )
}
