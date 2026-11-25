import { Form, NavLink } from 'react-router'
import { cn } from '../../lib/cn'
import { CAMPUS, sessionCan } from '../../lib/demo-api'
import { ROLE_LABEL, useSession } from '../../lib/session'
import { adminPath } from '../../lib/routes'
import {
  ClipboardIcon,
  HomeIcon,
  LayersIcon,
  MapPinIcon,
  SlidersIcon,
  UsersIcon,
} from '../ui/icons'

// Desktop version of the navigation: Figma component "Sidebar" (248 px), used by every
// "· Escritorio" frame. It only shows from `lg` up; on phones the BottomNav is used instead.
export function SideNav() {
  const session = useSession()
  const items = [
    { to: '/', label: 'Inicio', end: true, Icon: HomeIcon, show: true },
    { to: '/reportes', label: 'Reportes', end: false, Icon: ClipboardIcon, show: true },
    { to: '/mapa', label: 'Mapa', end: false, Icon: MapPinIcon, show: true },
    {
      to: adminPath('personal'),
      label: 'Personal',
      end: false,
      Icon: UsersIcon,
      show: sessionCan(session, 'roles.read'),
    },
    {
      to: adminPath('catalogo'),
      label: 'Catálogo',
      end: false,
      Icon: LayersIcon,
      show: sessionCan(session, 'catalog.manage'),
    },
    {
      to: adminPath('configuracion'),
      label: 'Configuración',
      end: false,
      Icon: SlidersIcon,
      show: sessionCan(session, 'mapThresholds.manage'),
    },
  ]

  return (
    <aside className="sticky top-0 hidden h-dvh w-62 shrink-0 flex-col border-r border-neutral-border bg-neutral-white lg:flex">
      <div className="flex flex-col items-start gap-1.5 bg-green px-5 pt-6 pb-6 text-neutral-white">
        <p className="text-[22px] leading-tight font-bold">Cima Fix</p>
        <p className="text-xs text-neutral-white/90">UABC {CAMPUS.name}</p>
        <p className="mt-0.5 rounded-pill bg-green-dark px-2.5 py-0.5 text-caption font-semibold">
          {ROLE_LABEL[session.role]}
        </p>
      </div>

      <nav aria-label="Principal" className="flex flex-col gap-1 p-3.5">
        {items
          .filter((item) => item.show)
          .map(({ to, label, end, Icon }) => (
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
        <p className="text-xs font-bold text-neutral-text">Tú · {ROLE_LABEL[session.role]}</p>
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
