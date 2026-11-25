import { Link, useLoaderData } from 'react-router'
import { mapLegend } from '../../../shared/domain/map-levels.ts'
import { NavScreen } from '../../components/layout/NavScreen'
import { LevelBadge } from '../../components/ui/Badge'
import { Card, SectionLabel } from '../../components/ui/Card'
import { ChevronRightIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import type { MapBuilding, MapLevel } from '../../lib/demo-api'
import { plural } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import type { mapLoader } from './data'

const LEVEL_LABEL: Record<MapLevel, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto' }

// Color plus a distinct shape or border per level, so the level never depends on color alone
// (RF-MAPA-09, RNF-USABILIDAD-06). A campus without map thresholds shows plain counts.
const phoneMarker: Record<MapLevel | 'none', string> = {
  low: 'size-7 rounded-full bg-green-light border border-green-dark text-neutral-black',
  medium: 'size-8 rounded-full bg-yellow border-2 border-gold-dark text-neutral-black',
  high: 'size-9 rounded-full bg-gold border-[3px] border-neutral-text text-neutral-black',
  none: 'size-8 rounded-full bg-neutral-white border-2 border-neutral-text-secondary text-neutral-text',
}

// Desktop frame "Mapa · Encargado · Escritorio": circles for Bajo and Medio, a square for Alto.
const desktopMarker: Record<MapLevel | 'none', string> = {
  low: 'rounded-full bg-green-light border-2 border-green-dark text-neutral-black',
  medium: 'rounded-full bg-yellow border-2 border-gold-dark text-neutral-black',
  high: 'rounded-control bg-status-error border-2 border-neutral-text text-neutral-white',
  none: 'rounded-full bg-neutral-white border-2 border-neutral-text-secondary text-neutral-text',
}

// RF-MAPA-16: the open reports of the building.
function buildingHref(name: string) {
  return `/reportes?${new URLSearchParams({ edificio: name, estado: 'open' })}`
}

function describe(building: MapBuilding) {
  const count = plural(building.openReports, 'reporte abierto', 'reportes abiertos')
  return building.level ? `${count}, nivel ${LEVEL_LABEL[building.level]}` : count
}

// Mouse shortcut on the plan: keyboard and screen reader users get the list instead.
function MarkerLink({ building, className }: { building: MapBuilding; className: string }) {
  return (
    <Link
      to={buildingHref(building.name)}
      tabIndex={-1}
      aria-label={`${building.name}: ${describe(building)}`}
      className={cn(
        'flex items-center justify-center text-xs font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
        className,
      )}
    >
      {building.openReports}
    </Link>
  )
}

function PhoneMarker({ building }: { building: MapBuilding & { position: { x: number; y: number } } }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-control border border-neutral-border bg-neutral-white p-3"
      style={{ left: `${building.position.x}%`, top: `${building.position.y}%` }}
    >
      {/* Building name under the marker, so each number says which building it is. */}
      <span className="pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 text-caption font-medium whitespace-nowrap text-green-dark">
        {building.name}
      </span>
      <MarkerLink building={building} className={phoneMarker[building.level ?? 'none']} />
    </div>
  )
}

// Desktop plan: each building with a position is a block with its name; the ones with open
// reports carry the indicator (RF-MAPA-07).
function DesktopBuilding({
  building,
}: {
  building: MapBuilding & { position: { x: number; y: number } }
}) {
  return (
    <div
      className="absolute flex h-[22%] w-[26%] -translate-x-1/2 -translate-y-1/2 flex-col justify-between rounded-control border border-card-border bg-canvas p-3"
      style={{ left: `${building.position.x}%`, top: `${building.position.y}%` }}
    >
      <div className="flex flex-1 items-center justify-center">
        {building.openReports > 0 && (
          <MarkerLink
            building={building}
            className={cn('size-10 text-base', desktopMarker[building.level ?? 'none'])}
          />
        )}
      </div>
      <span className="text-xs text-neutral-text-muted">{building.name}</span>
    </div>
  )
}

// /mapa — Figma frame D "Mapa del campus" and "Mapa · Encargado · Escritorio".
// The plan is a placeholder: the Leaflet plan (SDD 13.4) arrives with the catalog API.
export function MapPage() {
  const { buildings, thresholds, campus } = useLoaderData<typeof mapLoader>()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const withReports = buildings
    .filter((b) => b.openReports > 0)
    .sort((a, b) => b.openReports - a.openReports)
  const onPlan = buildings.filter(
    (b): b is MapBuilding & { position: { x: number; y: number } } => b.position !== null,
  )
  // RF-MAPA-10: ranges from the campus thresholds; none without thresholds.
  const legend = mapLegend(thresholds)
  const range = (min: number, max: number | null) => (max === null ? `${min} o más` : `${min} a ${max}`)

  const list = (
    <section className="flex flex-col gap-2 lg:gap-3" aria-labelledby="map-list">
      <SectionLabel id="map-list" className="lg:mt-1">
        Edificios con reportes abiertos
      </SectionLabel>
      {withReports.length === 0 ? (
        <p className="text-body text-neutral-text-muted">No hay reportes abiertos.</p>
      ) : (
        <ul className="flex flex-col gap-2 lg:gap-3">
          {withReports.map((b) => (
            <li key={b.name}>
              {isDesktop ? (
                <Link
                  to={buildingHref(b.name)}
                  className="flex items-center gap-3 rounded-xl border border-card-border bg-neutral-white px-4 py-3.5 hover:border-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center text-sm font-bold',
                      desktopMarker[b.level ?? 'none'],
                    )}
                  >
                    {b.openReports}
                  </span>
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-bold text-neutral-text">{b.name}</span>
                    <span className="text-caption text-neutral-text-muted">
                      {plural(b.openReports, 'reporte abierto', 'reportes abiertos')}
                      {b.level && ` · Nivel ${LEVEL_LABEL[b.level].toLowerCase()}`}
                    </span>
                  </span>
                  <ChevronRightIcon className="size-5 text-neutral-text-secondary" />
                </Link>
              ) : (
                <Link
                  to={buildingHref(b.name)}
                  className="flex items-center gap-2 rounded-card border border-neutral-border px-3 py-3 text-body hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                >
                  <span className="flex-1">{b.name}</span>
                  <span className="text-xs text-neutral-text-muted">
                    {plural(b.openReports, 'reporte', 'reportes')}
                  </span>
                  {b.level && <LevelBadge level={b.level}>{LEVEL_LABEL[b.level]}</LevelBadge>}
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )

  if (isDesktop) {
    return (
      <NavScreen title={`Mapa · ${campus}`} desktopTitle="Mapa" subtitle={`UABC ${campus}`}>
        <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-8 px-10 py-8">
          <div className="flex flex-col gap-3">
            <Card className="relative aspect-[3/2] max-h-[calc(100dvh-16rem)] min-h-96 overflow-hidden">
              <div aria-hidden="true" className="absolute inset-6">
                {onPlan.map((b) => (
                  <DesktopBuilding key={b.name} building={b} />
                ))}
              </div>
            </Card>
            {legend && (
              <Card as="ul" aria-label="Leyenda de niveles" className="flex flex-wrap gap-6 px-4 py-3">
                {legend.map(({ level, min, max }) => (
                  <li key={level} className="flex items-center gap-2 text-xs font-medium text-neutral-text">
                    <span aria-hidden="true" className={cn('size-4', desktopMarker[level])} />
                    {LEVEL_LABEL[level]}: {range(min, max)}
                  </li>
                ))}
              </Card>
            )}
          </div>
          {list}
        </div>
      </NavScreen>
    )
  }

  return (
    <NavScreen title={`Mapa · ${campus}`}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        <div
          aria-hidden="true"
          className="relative aspect-4/3 overflow-hidden rounded-card border border-neutral-border bg-green-surface"
        >
          {/* RF-MAPA-07: no indicator for a building without open reports. */}
          {onPlan
            .filter((b) => b.openReports > 0)
            .map((b) => (
              <PhoneMarker key={b.name} building={b} />
            ))}
        </div>

        {legend && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Leyenda de niveles">
            {legend.map(({ level, min, max }) => (
              <li key={level}>
                <LevelBadge level={level}>
                  {LEVEL_LABEL[level]}: {range(min, max)}
                </LevelBadge>
              </li>
            ))}
          </ul>
        )}
        {list}
      </div>
    </NavScreen>
  )
}
