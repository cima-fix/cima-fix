import { useState } from 'react'
import { Link, useFetcher, useLoaderData, useSearchParams } from 'react-router'
import { NavScreen } from '../../components/layout/NavScreen'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Select } from '../../components/ui/Field'
import { ChevronRightIcon, UsersIcon } from '../../components/ui/icons'
import { ReportCard } from '../../components/ui/ReportCard'
import { cn } from '../../lib/cn'
import { formatAge, formatNumber } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import { isOpen, STATUS_LABEL, type Report, type ReportStatus } from '../../lib/reports'
import { sessionCan, useSession } from '../../lib/session'
import { FILTERS, type reportListLoader } from './data'

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as ReportStatus[]).map((status) => ({
  value: status,
  label: STATUS_LABEL[status],
}))

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

// Shortcuts on a phone card; the API's allowedActions decides which ones (SDD 7.3).
function ReportActions({ report }: { report: Report }) {
  const fetcher = useFetcher()
  if (report.allowedActions.includes('resolve')) {
    return (
      <fetcher.Form method="post" action={`/reportes/${report.id}`}>
        <Button type="submit" name="intent" value="resolve" size="sm" disabled={fetcher.state !== 'idle'}>
          {fetcher.state === 'idle' ? 'Resolver' : 'Resolviendo…'}
        </Button>
      </fetcher.Form>
    )
  }
  if (report.status === 'new' && report.allowedActions.includes('assign')) {
    return (
      <ButtonLink to={`/reportes/${report.id}/asignar`} size="sm">
        Asignar
      </ButtonLink>
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
      <div className="flex flex-col gap-2.5">
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
  const { email } = useSession()
  const head = 'px-4 py-3 text-left text-caption font-semibold tracking-wide uppercase'
  // RN-04: the Asignado a column only exists for the staff of the campus.
  const showAssignee = reports.some((r) => r.assigneeEmail !== undefined)
  const columns = showAssignee ? 7 : 6
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
            {showAssignee && (
              <th scope="col" className={head}>
                Asignado a
              </th>
            )}
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
                  {report.category.name} · {report.space.name}
                </Link>
                <p className="text-xs text-neutral-text-muted">
                  {report.building.name} · {report.campus.name}
                </p>
              </td>
              <td className="px-4 py-3.5 text-neutral-text-secondary">
                <span className="flex items-center gap-1.5">
                  <UsersIcon className="size-4" />
                  {formatNumber(report.confirmationCount)}
                </span>
              </td>
              {showAssignee && (
                <td className="max-w-56 truncate px-4 py-3.5 text-xs">
                  {!report.assigneeEmail ? (
                    <span className="text-neutral-text-muted">Sin asignar</span>
                  ) : report.assigneeEmail === email ? (
                    <span className="font-bold text-neutral-text">Tú</span>
                  ) : (
                    <span className="font-medium text-neutral-text">{report.assigneeEmail}</span>
                  )}
                </td>
              )}
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
              <td colSpan={columns} className="px-4 py-8 text-center text-neutral-text-muted">
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

// The loaded pages: the first one from the loader and the ones "Ver más" adds (cursor
// pagination, SDD 7.1). Starts over whenever the filters change.
function usePages(first: Awaited<ReturnType<typeof reportListLoader>>['page'], filters: string) {
  const fetcher = useFetcher<typeof reportListLoader>()
  const [more, setMore] = useState<{ filters: string; reports: Report[]; nextCursor: string | null }>()
  const [added, setAdded] = useState<typeof fetcher.data>()
  const extra = more?.filters === filters ? more : undefined

  // A page that just arrived is added once (derived during render, not in an effect).
  if (fetcher.state === 'idle' && fetcher.data && fetcher.data !== added) {
    setAdded(fetcher.data)
    const page = fetcher.data.page
    setMore({ filters, reports: [...(extra?.reports ?? []), ...page.reports], nextCursor: page.nextCursor })
  }

  const nextCursor = extra ? extra.nextCursor : first.nextCursor
  return {
    reports: [...first.reports, ...(extra?.reports ?? [])],
    loading: fetcher.state !== 'idle',
    loadMore: nextCursor
      ? () => {
          const params = new URLSearchParams(filters)
          params.set('cursor', nextCursor)
          fetcher.load(`/reportes?${params}`)
        }
      : undefined,
  }
}

// /reportes — Figma frame A "Lista de reportes" (phone) and "Reportes · Encargado · Escritorio".
export function ReportListPage() {
  const { campus, options, page } = useLoaderData<typeof reportListLoader>()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const filters = new URLSearchParams([...params].filter(([key]) => key !== 'cursor')).toString()
  const { reports, loading, loadMore } = usePages(page, filters)

  const building = params.get(FILTERS.building) ?? ''
  const category = params.get(FILTERS.category) ?? ''
  const status = params.get(FILTERS.status) ?? ''
  const mine = params.has(FILTERS.mine)
  const assigned = params.has(FILTERS.assigned)
  // Only staff are assigned reports (RF-GESTION-06).
  const canBeAssigned = campus ? sessionCan(session, 'report.resolveAssigned', campus.id) : false

  function setFilters(change: Record<string, string | boolean>) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('cursor')
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

  const campusSelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Campus"
      options={session.campuses.map((c) => ({ value: c.slug, label: c.name }))}
      value={campus?.slug ?? ''}
      // A new campus clears the building and category of the previous one (RF-GESTION-04).
      onChange={(e) =>
        setFilters({ [FILTERS.campus]: e.target.value, [FILTERS.building]: '', [FILTERS.category]: '' })
      }
      className={className}
    />
  )
  const statusSelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Estado"
      placeholder={isDesktop ? 'Estado' : 'Estado: todos'}
      options={STATUS_OPTIONS}
      value={status}
      onChange={(e) => setFilter(FILTERS.status, e.target.value)}
      className={className}
    />
  )
  const buildingSelect = (className?: string) => (
    <Select
      size="sm"
      aria-label="Edificio"
      placeholder="Edificio"
      options={(options?.buildings ?? []).map((b) => ({ value: b.id, label: b.name }))}
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
      options={(options?.categories ?? []).map((c) => ({ value: c.id, label: c.name }))}
      value={category}
      onChange={(e) => setFilter(FILTERS.category, e.target.value)}
      className={className}
    />
  )

  const more = loadMore && (
    <Button variant="secondary" onClick={loadMore} disabled={loading} className="lg:w-auto lg:self-center lg:px-8">
      {loading ? 'Cargando…' : 'Ver más reportes'}
    </Button>
  )
  const title = campus ? `Reportes · ${campus.name}` : 'Reportes'

  if (isDesktop) {
    return (
      <NavScreen title={title} desktopTitle="Reportes" subtitle={campus?.name}>
        <div className="flex flex-col gap-4 px-10 py-8">
          <Card className="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Mostrar">
              <ScopePill
                pressed={!assigned && !mine}
                onClick={() => setFilters({ [FILTERS.assigned]: false, [FILTERS.mine]: false })}
              >
                Todos
              </ScopePill>
              {canBeAssigned && (
                <ScopePill
                  pressed={assigned}
                  onClick={() => setFilters({ [FILTERS.assigned]: !assigned, [FILTERS.mine]: false })}
                >
                  Asignados a mí
                </ScopePill>
              )}
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
          <ReportTable reports={reports} />
          {more}
        </div>
      </NavScreen>
    )
  }

  const open = reports.filter(isOpen)
  const closed = reports.filter((r) => !isOpen(r))

  return (
    <NavScreen title={title}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Filtros">
          {campusSelect()}
          {statusSelect()}
          {buildingSelect()}
          {categorySelect()}
        </div>
        <div className="flex flex-wrap gap-2">
          {canBeAssigned && (
            <FilterTag pressed={assigned} onToggle={() => setFilter(FILTERS.assigned, !assigned)}>
              Asignados a mí
            </FilterTag>
          )}
          <FilterTag pressed={mine} onToggle={() => setFilter(FILTERS.mine, !mine)}>
            Mis reportes
          </FilterTag>
        </div>

        <Section title="Abiertos" reports={open} />
        <Section title="Cerrados" reports={closed} />
        {reports.length === 0 && (
          <p className="py-6 text-center text-body text-neutral-text-muted">
            No hay reportes con estos filtros.
          </p>
        )}
        {more}
      </div>
    </NavScreen>
  )
}
