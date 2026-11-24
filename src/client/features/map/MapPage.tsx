import { Link, useLoaderData } from 'react-router'
import { NavScreen } from '../../components/layout/NavScreen'
import { LevelBadge } from '../../components/ui/Badge'
import { cn } from '../../lib/cn'
import { MAP_THRESHOLDS, type MapBuilding, type MapLevel } from '../../lib/demo-api'
import { plural } from '../../lib/format'
import type { mapLoader } from './data'

const LEVEL_LABEL: Record<MapLevel, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto' }

// Color plus a distinct border per level, so the level never depends on color alone
// (RF-MAPA-09, RNF-USABILIDAD-06).
const markerStyle: Record<MapLevel, string> = {
  low: 'size-7 bg-green-light border border-green-dark',
  medium: 'size-8 bg-yellow border-2 border-gold-dark',
  high: 'size-9 bg-gold border-[3px] border-neutral-text',
}

// RF-MAPA-16: the open reports of the building.
function buildingHref(name: string) {
  return `/reportes?${new URLSearchParams({ edificio: name, estado: 'open' })}`
}

function Marker({ building }: { building: MapBuilding }) {
  return (
    <div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-control border border-neutral-border bg-neutral-white p-3"
      style={{ left: `${building.x}%`, top: `${building.y}%` }}
    >
      {/* Building name under the marker, so each number says which building it is. */}
      <span className="pointer-events-none absolute top-full left-1/2 mt-0.5 -translate-x-1/2 text-caption font-medium whitespace-nowrap text-green-dark">
        {building.name}
      </span>
      {/* Mouse shortcut only: keyboard and screen reader users get the list below. */}
      <Link
        to={buildingHref(building.name)}
        tabIndex={-1}
        aria-label={`${building.name}: ${plural(building.openReports, 'reporte abierto', 'reportes abiertos')}, nivel ${LEVEL_LABEL[building.level]}`}
        className={cn(
          'flex items-center justify-center rounded-full text-xs font-medium text-neutral-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
          markerStyle[building.level],
        )}
      >
        {building.openReports}
      </Link>
    </div>
  )
}

// /mapa — Figma frame D "Mapa del campus".
// The plan is a placeholder: the Leaflet plan (SDD 13.4) arrives with the catalog API.
export function MapPage() {
  const { buildings, campus } = useLoaderData<typeof mapLoader>()
  const withReports = buildings
    .filter((b) => b.openReports > 0)
    .sort((a, b) => b.openReports - a.openReports)

  return (
    <NavScreen title={`Mapa · ${campus}`}>
      <div className="flex flex-col gap-3 px-4 py-3.5 lg:mx-auto lg:grid lg:w-full lg:max-w-7xl lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8 lg:px-8 lg:py-6">
        <div className="flex flex-col gap-3">
        <div
          aria-hidden="true"
          className="relative aspect-4/3 overflow-hidden rounded-card border border-neutral-border bg-green-surface lg:aspect-auto lg:h-[calc(100dvh-11rem)] lg:min-h-96"
        >
          {/* RF-MAPA-07: no indicator for a building without open reports. */}
          {withReports.map((b) => (
            <Marker key={b.name} building={b} />
          ))}
        </div>

        <ul className="flex flex-wrap gap-1.5" aria-label="Leyenda de niveles">
          <li>
            <LevelBadge level="low">Bajo: 1 a {MAP_THRESHOLDS.medium - 1}</LevelBadge>
          </li>
          <li>
            <LevelBadge level="medium">
              Medio: {MAP_THRESHOLDS.medium} a {MAP_THRESHOLDS.high - 1}
            </LevelBadge>
          </li>
          <li>
            <LevelBadge level="high">Alto: {MAP_THRESHOLDS.high} o más</LevelBadge>
          </li>
        </ul>
        </div>

        {/* Text alternative to the map (RF-MAPA-15). */}
        <section className="flex flex-col gap-2">
          <h2 className="text-caption font-medium tracking-wide text-neutral-text-secondary uppercase">
            Edificios con reportes abiertos
          </h2>
          {withReports.length === 0 ? (
            <p className="text-body text-neutral-text-muted">No hay reportes abiertos.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {withReports.map((b) => (
                <li key={b.name}>
                  <Link
                    to={buildingHref(b.name)}
                    className="flex items-center gap-2 rounded-card border border-neutral-border px-3 py-3 text-body hover:bg-neutral-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
                  >
                    <span className="flex-1">{b.name}</span>
                    <span className="text-xs text-neutral-text-muted">
                      {plural(b.openReports, 'reporte', 'reportes')}
                    </span>
                    <LevelBadge level={b.level}>{LEVEL_LABEL[b.level]}</LevelBadge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </NavScreen>
  )
}
