import { useFetcher, useLoaderData, useSearchParams } from 'react-router'
import { NavScreen } from '../../components/layout/NavScreen'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Select } from '../../components/ui/Field'
import { ReportCard } from '../../components/ui/ReportCard'
import { cn } from '../../lib/cn'
import { CURRENT_USER } from '../../lib/demo-api'
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
      {reports.map((report) => (
        <ReportCard key={report.id} report={report} variant="list" href={`/reportes/${report.id}`}>
          {isOpen(report) && <ReportActions report={report} />}
        </ReportCard>
      ))}
    </section>
  )
}

// /reportes — Figma frame A "Lista de reportes".
export function ReportListPage() {
  const { reports, catalog } = useLoaderData<typeof reportListLoader>()
  const [params, setParams] = useSearchParams()
  const campus = catalog.campuses[0] ?? ''

  const building = params.get(FILTERS.building) ?? ''
  const category = params.get(FILTERS.category) ?? ''
  const status = params.get(FILTERS.status) ?? ''
  const mine = params.has(FILTERS.mine)
  const assigned = params.has(FILTERS.assigned)

  function setFilter(key: string, value: string | boolean) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === '' || value === false) next.delete(key)
        else next.set(key, value === true ? '1' : value)
        return next
      },
      { replace: true },
    )
  }

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

  return (
    <NavScreen title={`Reportes · ${campus}`}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Filtros">
          {/* Only one active campus for now; it becomes a real filter with the second one. */}
          <Select size="sm" aria-label="Campus" options={catalog.campuses} defaultValue={campus} />
          <Select
            size="sm"
            aria-label="Estado"
            placeholder="Estado: todos"
            options={Object.values(STATUS_FILTER_LABEL)}
            value={STATUS_FILTER_LABEL[status as StatusFilter] ?? ''}
            onChange={(e) => setFilter(FILTERS.status, STATUS_BY_LABEL[e.target.value] ?? '')}
          />
          <Select
            size="sm"
            aria-label="Edificio"
            placeholder="Edificio"
            options={catalog.buildings.map((b) => b.name)}
            value={building}
            onChange={(e) => setFilter(FILTERS.building, e.target.value)}
          />
          <Select
            size="sm"
            aria-label="Categoría"
            placeholder="Categoría"
            options={catalog.categories.map((c) => c.name)}
            value={category}
            onChange={(e) => setFilter(FILTERS.category, e.target.value)}
          />
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
