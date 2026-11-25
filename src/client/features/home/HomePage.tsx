import { useEffect } from 'react'
import { Form, Link, useLoaderData, useRevalidator } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card, SectionLabel } from '../../components/ui/Card'
import {
  ChevronRightIcon,
  ClipboardIcon,
  MapPinIcon,
  UsersIcon,
} from '../../components/ui/icons'
import { CAMPUS, CURRENT_USER, sessionCan } from '../../lib/demo-api'
import { formatAge, plural } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import { compareReports, isOpen, type Report } from '../../lib/reports'
import { adminPath } from '../../lib/routes'
import { ROLE_LABEL, useSession } from '../../lib/session'
import type { homeLoader } from './data'

const linkClasses =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green'

function StatCard({
  value,
  label,
  to,
  tone,
}: {
  value: number
  label: string
  to: string
  tone: string
}) {
  return (
    <Card className="flex flex-col gap-1 px-6 py-5">
      <p className={`text-[40px] leading-none font-bold ${tone}`}>{value}</p>
      <p className="mt-2 text-base text-neutral-text-secondary">{label}</p>
      <Link
        to={to}
        aria-label={`Ver ${label.toLowerCase()}`}
        className={`flex w-fit items-center gap-1 rounded-chip text-sm font-semibold text-green hover:underline ${linkClasses}`}
      >
        Ver <ChevronRightIcon className="size-4" strokeWidth={2.5} />
      </Link>
    </Card>
  )
}

function assigneeLabel(report: Report) {
  if (!report.assignee) return 'Sin asignar'
  return report.assignee === CURRENT_USER ? 'Tú' : report.assignee
}

// Report card of the desktop home ("Lo más urgente para ti").
function UrgentCard({ report }: { report: Report }) {
  return (
    <Card as="article" className="relative flex flex-col gap-2 px-5 py-4 hover:border-green">
      <div className="flex flex-wrap items-center gap-2">
        <PriorityBadge priority={report.priority} />
        <StatusBadge status={report.status} />
        <span className="text-xs text-neutral-text-muted">{formatAge(report.createdAt)}</span>
      </div>
      <h3 className="mt-1 text-heading font-bold text-neutral-text">
        <Link
          to={`/reportes/${report.id}`}
          className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-green"
        >
          {report.category} · {report.space}
        </Link>
      </h3>
      <p className="text-xs text-neutral-text-muted">
        {report.building} · {report.campus}
      </p>
      <p className="text-body text-neutral-text-secondary">{report.description}</p>
      <p className="flex items-center gap-1.5 text-xs text-neutral-text-secondary">
        <UsersIcon className="size-4" />
        {plural(report.confirmations, 'confirmación', 'confirmaciones')}
      </p>
      <p className="text-xs text-neutral-text-muted">
        Asignado a: <span className="font-bold text-neutral-text">{assigneeLabel(report)}</span>
      </p>
    </Card>
  )
}

function QuickLink({
  to,
  title,
  description,
  Icon,
}: {
  to: string
  title: string
  description: string
  Icon: typeof MapPinIcon
}) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3.5 rounded-xl border border-card-border bg-neutral-white px-4 py-3.5 hover:border-green ${linkClasses}`}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-green-surface text-green-dark">
        <Icon className="size-5" />
      </span>
      <span className="flex flex-1 flex-col">
        <span className="text-sm font-bold text-neutral-text">{title}</span>
        <span className="text-caption text-neutral-text-muted">{description}</span>
      </span>
      <ChevronRightIcon className="size-5 text-neutral-text-secondary" />
    </Link>
  )
}

// / — entry point to reporting, the report list and the map (SDD 13.2).
// Phone: intro and three buttons. Desktop (lg): Figma frame "Inicio · Encargado · Escritorio",
// with what needs attention, the most urgent reports and the quick links.
export function HomePage() {
  const { reports } = useLoaderData<typeof homeLoader>()
  const session = useSession()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const revalidator = useRevalidator()

  // The loader skips the reports on a phone; load them if the window grows to desktop.
  useEffect(() => {
    if (isDesktop && reports === null && revalidator.state === 'idle') {
      void revalidator.revalidate()
    }
  }, [isDesktop, reports, revalidator])

  const open = reports?.filter(isOpen) ?? []
  const unassigned = open.filter((r) => r.status === 'new' && !r.assignee).length
  const mine = open.filter((r) => r.assignee === CURRENT_USER)
  // Reports assigned to the account and the ones nobody has yet, most urgent first
  // (RF-GESTION-14).
  const urgent = open
    .filter((r) => r.assignee === CURRENT_USER || !r.assignee)
    .sort(compareReports)
    .slice(0, 4)

  const adminLinks = [
    { to: adminPath('personal'), label: 'Personal', show: sessionCan(session, 'roles.read') },
    { to: adminPath('catalogo'), label: 'Catálogo', show: sessionCan(session, 'catalog.manage') },
    {
      to: adminPath('configuracion'),
      label: 'Configuración',
      show: sessionCan(session, 'mapThresholds.manage'),
    },
  ].filter((link) => link.show)

  return (
    <>
      <ScreenHeader
        title="Cima Fix"
        desktopTitle="Inicio"
        subtitle={`UABC ${CAMPUS.name} · ${ROLE_LABEL[session.role]}`}
      />

      {/* Phone */}
      <div className="flex flex-col gap-3 px-4 py-6 lg:hidden">
        <p className="text-body text-neutral-text-secondary">
          Reporta un problema del campus o revisa en qué va.
        </p>
        <ButtonLink to="/reportar">Reportar un problema</ButtonLink>
        <ButtonLink to="/reportes" variant="secondary">
          Ver reportes
        </ButtonLink>
        <ButtonLink to="/mapa" variant="secondary">
          Ver mapa del campus
        </ButtonLink>
        {adminLinks.length > 0 && (
          <nav aria-label="Administración" className="mt-3 flex flex-col gap-2">
            <SectionLabel as="p">Administración del campus</SectionLabel>
            {adminLinks.map((link) => (
              <ButtonLink key={link.to} to={link.to} variant="outline">
                {link.label}
              </ButtonLink>
            ))}
          </nav>
        )}
        {/* The side menu with "Cerrar sesión" is desktop only. */}
        <Form method="post" action="/salir" className="mt-6 flex flex-col gap-2 border-t border-neutral-border pt-4">
          <p className="text-xs text-neutral-text-muted">
            {session.email} · {ROLE_LABEL[session.role]}
          </p>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </Form>
      </div>

      {/* Desktop */}
      {reports && (
        <div className="hidden px-10 py-8 lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start lg:gap-8">
          <div className="flex flex-col gap-3">
            <SectionLabel>Para atender</SectionLabel>
            <div className="grid grid-cols-2 gap-4">
              <StatCard
                value={unassigned}
                label="Nuevos sin asignar"
                to="/reportes?estado=new"
                tone="text-blue"
              />
              <StatCard
                value={mine.length}
                label="Asignados a mí"
                to="/reportes?asignados=1"
                tone="text-gold-dark"
              />
            </div>

            <SectionLabel className="mt-5">Lo más urgente para ti</SectionLabel>
            {urgent.length === 0 ? (
              <p className="text-body text-neutral-text-muted">No hay reportes abiertos.</p>
            ) : (
              <div className="grid grid-cols-2 items-start gap-4">
                {urgent.map((report) => (
                  <UrgentCard key={report.id} report={report} />
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3">
            <ButtonLink to="/reportar" className="py-3 text-sm font-semibold">
              Reportar una incidencia
            </ButtonLink>
            <SectionLabel className="mt-5">Accesos rápidos</SectionLabel>
            <QuickLink
              to="/reportes?mios=1"
              title="Mis reportes"
              description="Los que registré o confirmé"
              Icon={ClipboardIcon}
            />
            <QuickLink
              to="/mapa"
              title="Mapa del campus"
              description="Reportes abiertos por edificio"
              Icon={MapPinIcon}
            />
          </div>
        </div>
      )}
    </>
  )
}
