import { Form, NavLink } from 'react-router'
import { cn } from '../../lib/cn'
import { adminLinks, type AdminSection } from '../../lib/routes'
import { ROLE_LABEL, sessionRole, useSession } from '../../lib/session'
import {
  ClipboardIcon,
  HomeIcon,
  LayersIcon,
  MapPinIcon,
  SlidersIcon,
  UsersIcon,
} from '../ui/icons'

const adminIcon: Record<AdminSection, typeof HomeIcon> = {
  personal: UsersIcon,
  catalogo: LayersIcon,
  configuracion: SlidersIcon,
}

// Desktop version of the navigation: Figma component "Sidebar" (248 px), used by every
// "· Escritorio" frame. It only shows from `lg` up; on phones the BottomNav is used instead.
export function SideNav() {
  const session = useSession()
  const role = ROLE_LABEL[sessionRole(session)]
  const items = [
    { to: '/', label: 'Inicio', end: true, Icon: HomeIcon },
    { to: '/reportes', label: 'Reportes', end: false, Icon: ClipboardIcon },
    { to: '/mapa', label: 'Mapa', end: false, Icon: MapPinIcon },
    ...adminLinks(session).map((link) => ({ ...link, end: false, Icon: adminIcon[link.section] })),
  ]

  return (
    <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r border-neutral-border bg-neutral-white lg:flex">
      <div className="flex flex-col items-start gap-1.5 bg-green px-5 pt-6 pb-6 text-neutral-white">
        <p className="text-[22px] leading-tight font-bold">Cima Fix</p>
        {session.campus && <p className="text-xs text-neutral-white/90">{session.campus.name}</p>}
        <p className="mt-0.5 rounded-pill bg-green-dark px-2.5 py-0.5 text-caption font-semibold">
          {role}
        </p>
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-1 p-3.5">
        {items.map(({ to, label, end, Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-card px-3 py-2.5 text-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
                isActive
                  ? 'bg-green-surface font-semibold text-green-dark'
                  : 'text-neutral-text-secondary hover:bg-neutral-surface',
              )
            }
          >
            <Icon className="size-5" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col items-start gap-0.5 border-t border-neutral-border px-5 py-4">
        <p className="text-xs font-bold text-neutral-text">Tú · {role}</p>
        <p className="text-caption break-all text-neutral-text-muted">{session.email}</p>
        <Form method="post" action="/salir">
          <button
            type="submit"
            className="mt-1 rounded-chip text-xs font-semibold text-green hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            Cerrar sesión
          </button>
        </Form>
      </div>
    </aside>
  )
}
