import { Link, useFetcher, useLoaderData, useSearchParams } from 'react-router'
import { NavScreen } from '../../components/layout/NavScreen'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Field'
import { ChevronRightIcon, UsersIcon } from '../../components/ui/icons'
import { ReportCard } from '../../components/ui/ReportCard'
import { cn } from '../../lib/cn'
import { CURRENT_USER } from '../../lib/demo-api'
import { formatAge, formatNumber } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import { isOpen, STATUS_LABEL, type Report, type ReportStatus } from '../../lib/reports'
import type { reportListLoader } from './data'

// Estado filter: every status plus "Abiertos" (Nuevo + En revisión), used by the map
// to list only the open reports of a building (RF-MAPA-16).
type StatusFilter = ReportStatus | 'open'
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { open: 'Abiertos', ...STATUS_LABEL }
const STATUS_BY_LABEL = Object.fromEntries(
  Object.entries(STATUS_FILTER_LABEL).map(([status, label]) => [label, status]),
) as Record<string, StatusFilter>

function matchesStatus(report: Report, status: string) {
  if (!status) return true
  return status === 'open' ? isOpen(report) : report.status === status
}

// Filter state lives in the URL so it survives reloads and can be linked (e.g. from the map).
const FILTERS = {
  building: 'edificio',
  category: 'categoria',
  status: 'estado',
  mine: 'mios',
  assigned: 'asignados',
} as const

function FilterTag({
  pressed,
  onToggle,
  children,
}: {
  pressed: boolean
  onToggle: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={cn(
        'rounded-pill border border-green px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
        pressed ? 'bg-green text-neutral-white' : 'bg-neutral-white text-green-dark',
      )}
    >
      {children}
    </button>
  )
}

function ReportActions({ report }: { report: Report }) {
  const fetcher = useFetcher()
  if (report.status === 'new') {
    return (
      <ButtonLink to={`/reportes/${report.id}/asignar`} size="sm">
        Asignar
      </ButtonLink>
    )
  }
  if (report.status === 'in_review' && report.assignee === CURRENT_USER) {
    return (
      <fetcher.Form method="post" action={`/reportes/${report.id}`}>
        <Button type="submit" name="intent" value="resolve" size="sm" disabled={fetcher.state !== 'idle'}>
          {fetcher.state === 'idle' ? 'Resolver' : 'Resolviendo…'}
        </Button>
      </fetcher.Form>
    )
  }
  return null
}

function Section({ title, reports }: { title: string; reports: Report[] }) {
  if (reports.length === 0) return null
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="text-caption font-medium tracking-wide text-neutral-text-secondary uppercase">
        {title}
      </h2>
      <div className="flex flex-col gap-2.5 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {reports.map((report) => (
          <ReportCard key={report.id} report={report} variant="list" href={`/reportes/${report.id}`}>
            {isOpen(report) && <ReportActions report={report} />}
          </ReportCard>
        ))}
      </div>
    </section>
  )
}

// Desktop table of the Figma frame "Reportes · Encargado · Escritorio".
function ReportTable({ reports }: { reports: Report[] }) {
  const head = 'px-4 py-3 text-left text-caption font-semibold tracking-wide uppercase'
  return (
    <Card className="overflow-hidden">
      <table className="w-full border-collapse text-body">
        <thead className="bg-canvas text-neutral-text-muted">
          <tr>
            <th scope="col" className={head}>
              Prioridad
            </th>
            <th scope="col" className={head}>
              Estado
            </th>
            <th scope="col" className={head}>
              Reporte
            </th>
            <th scope="col" className={head}>
              <abbr title="Confirmaciones" className="no-underline">
                Confirm.
              </abbr>
            </th>
            <th scope="col" className={head}>
              Asignado a
            </th>
            <th scope="col" className={head}>
              Creado
            </th>
            <th scope="col" className="w-10">
              <span className="sr-only">Abrir</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {reports.map((report) => (
            <tr
              key={report.id}
              className="relative border-t border-card-border hover:bg-canvas/60 has-focus-visible:bg-canvas/60"
            >
              <td className="px-4 py-3.5">
                <PriorityBadge priority={report.priority} />
              </td>
              <td className="px-4 py-3.5">
                <StatusBadge status={report.status} />
              </td>
              <td className="px-4 py-3.5">
                <Link
                  to={`/reportes/${report.id}`}
                  className="font-bold text-neutral-text after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-green focus-visible:after:ring-inset"
                >
                  {report.category} · {report.space}
                </Link>
                <p className="text-xs text-neutral-text-muted">
                  {report.building} · {report.campus}
                </p>
              </td>
              <td className="px-4 py-3.5 text-neutral-text-secondary">
                <span className="flex items-center gap-1.5">
                  <UsersIcon className="size-4" />
                  {formatNumber(report.confirmations)}
                </span>
              </td>
              <td className="max-w-56 truncate px-4 py-3.5 text-xs">
                {!report.assignee ? (
                  <span className="text-neutral-text-muted">Sin asignar</span>
                ) : report.assignee === CURRENT_USER ? (
                  <span className="font-bold text-neutral-text">Tú</span>
                ) : (
                  <span className="font-medium text-neutral-text">{report.assignee}</span>
                )}
              </td>
              <td className="px-4 py-3.5 text-xs whitespace-nowrap text-neutral-text-muted">
                {formatAge(report.createdAt)}
              </td>
              <td className="pr-4 text-neutral-text-secondary">
                <ChevronRightIcon className="size-5" />
              </td>
            </tr>
          ))}
          {reports.length === 0 && (
            <tr className="border-t border-card-border">
              <td colSpan={7} className="px-4 py-8 text-center text-neutral-text-muted">
                No hay reportes con estos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </Card>
  )
}

// "Todos / Asignados a mí / Mis reportes" pills of the desktop filter bar.
function ScopePill({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean
  onClick: () => void
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'rounded-pill border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
        pressed
          ? 'border-green bg-green text-neutral-white'
          : 'border-card-border bg-neutral-white text-neutral-text hover:border-green',
      )}
    >
      {children}
    </button>
  )
}

const desktopSelect = 'border-card-border bg-canvas py-2.5 text-sm'

// /reportes — Figma frame A "Lista de reportes" (phone) and "Reportes · Encargado · Escritorio".
export function ReportListPage() {
  const { reports, catalog } = useLoaderData<typeof reportListLoader>()
  const [params, setParams] = useSearchParams()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const campus = catalog.campuses[0] ?? ''

  const building = params.get(FILTERS.building) ?? ''
  const category = params.get(FILTERS.category) ?? ''
  const status = params.get(FILTERS.status) ?? ''
  const mine = params.has(FILTERS.mine)
  const assigned = params.has(FILTERS.assigned)

  function setFilters(change: Record<string, string | boolean>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(change)) {
          if (value === '' || value === false) next.delete(key)
          else next.set(key, value === true ? '1' : value)
        }
        return next
      },
      { replace: true },
    )
  }
  const setFilter = (key: string, value: string | boolean) => setFilters({ [key]: value })

  const visible = reports.filter(
    (r) =>
      (!building || r.building === building) &&
      (!category || r.category === category) &&
      matchesStatus(r, status) &&
      (!assigned || r.assignee === CURRENT_USER) &&
      (!mine || r.reportedByMe || r.confirmedByMe),
  )
  const open = visible.filter(isOpen)
  const closed = visible.filter((r) => !isOpen(r))

  const campusSelect = (className?: string) => (
    // Only one active campus for now; it becomes a real filter with the second one.
    <Select
      size="sm"
      aria-label="Campus"
      options={catalog.campuses}
      defaultValue={campus}
      className={className}
    />
  )
  const statusSelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Estado"
      placeholder={isDesktop ? 'Estado' : 'Estado: todos'}
      options={Object.values(STATUS_FILTER_LABEL)}
      value={STATUS_FILTER_LABEL[status as StatusFilter] ?? ''}
      onChange={(e) => setFilter(FILTERS.status, STATUS_BY_LABEL[e.target.value] ?? '')}
      className={className}
    />
  )
  const buildingSelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Edificio"
      placeholder="Edificio"
      options={catalog.buildings.map((b) => b.name)}
      value={building}
      onChange={(e) => setFilter(FILTERS.building, e.target.value)}
      className={className}
    />
  )
  const categorySelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Categoría"
      placeholder="Categoría"
      options={catalog.categories.map((c) => c.name)}
      value={category}
      onChange={(e) => setFilter(FILTERS.category, e.target.value)}
      className={className}
    />
  )

  if (isDesktop) {
    return (
      <NavScreen title={`Reportes · ${campus}`} desktopTitle="Reportes" subtitle={`UABC ${campus}`}>
        <div className="flex flex-col gap-4 px-10 py-8">
          <Card className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
              <ScopePill
                pressed={!assigned && !mine}
                onClick={() => setFilters({ [FILTERS.assigned]: false, [FILTERS.mine]: false })}
              >
                Todos
              </ScopePill>
              <ScopePill
                pressed={assigned}
                onClick={() => setFilters({ [FILTERS.assigned]: !assigned, [FILTERS.mine]: false })}
              >
                Asignados a mí
              </ScopePill>
              <ScopePill
                pressed={mine}
                onClick={() => setFilters({ [FILTERS.mine]: !mine, [FILTERS.assigned]: false })}
              >
                Mis reportes
              </ScopePill>
            </div>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtros">
              {campusSelect(desktopSelect)}
              {statusSelect(desktopSelect)}
              {categorySelect(desktopSelect)}
              {buildingSelect(desktopSelect)}
            </div>
          </Card>
          <p className="text-xs text-neutral-text-muted">
            Abiertos primero · mayor prioridad · más antiguos
          </p>
          <ReportTable reports={visible} />
        </div>
      </NavScreen>
    )
  }

  return (
    <NavScreen title={`Reportes · ${campus}`}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Filtros">
          {campusSelect()}
          {statusSelect()}
          {buildingSelect()}
          {categorySelect()}
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterTag pressed={assigned} onToggle={() => setFilter(FILTERS.assigned, !assigned)}>
            Asignados a mí
          </FilterTag>
          <FilterTag pressed={mine} onToggle={() => setFilter(FILTERS.mine, !mine)}>
            Los que reporté o confirmé
          </FilterTag>
        </div>

        <Section title={`Abiertos · ${open.length}`} reports={open} />
        <Section title="Cerrados" reports={closed} />
        {visible.length === 0 && (
          <p className="py-6 text-center text-body text-neutral-text-muted">
            No hay reportes con estos filtros.
          </p>
        )}
      </div>
    </NavScreen>
  )
}
