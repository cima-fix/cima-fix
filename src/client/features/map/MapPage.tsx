import { divIcon, CRS, type LatLngBoundsExpression } from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { ImageOverlay, MapContainer, Marker, Popup, ZoomControl } from 'react-leaflet'
import { Link, useLoaderData, useLocation, useNavigate, useOutlet, useRouteLoaderData } from 'react-router'
import { NavScreen } from '../../components/layout/NavScreen'
import { LevelBadge } from '../../components/ui/Badge'
import { Card, SectionLabel } from '../../components/ui/Card'
import { Select } from '../../components/ui/Field'
import { Notice } from '../../components/ui/Notice'
import { ArrowLeftIcon, ChevronRightIcon } from '../../components/ui/icons'
import { ReportCard } from '../../components/ui/ReportCard'
import { cn } from '../../lib/cn'
import { plural } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import type { buildingReportsLoader, mapLoader } from './data'

type MapData = Awaited<ReturnType<typeof mapLoader>>
type Indicator = MapData['map']['indicators'][number]
type Level = NonNullable<Indicator['level']>

const LEVEL_LABEL: Record<Level, string> = { low: 'Bajo', medium: 'Medio', high: 'Alto' }

// Color plus a different shape or border per level, so the level never depends on color alone
// (RF-MAPA-09, RNF-USABILIDAD-06). Circles for Bajo and Medio, a square for Alto, as in the
// desktop frame; without map thresholds every indicator looks the same.
const markerStyle: Record<Level | 'none', string> = {
  low: 'rounded-full bg-green-light border-2 border-green-dark text-neutral-black',
  medium: 'rounded-full bg-yellow border-2 border-gold-dark text-neutral-black',
  high: 'rounded-control bg-status-error border-2 border-neutral-text text-neutral-white',
  none: 'rounded-full bg-neutral-white border-2 border-neutral-text-secondary text-neutral-text',
}

const range = (min: number, max: number | null) => (max === null ? `${min} o más` : `${min} a ${max}`)

function campusQuery(slug: string) {
  return `?${new URLSearchParams({ campus: slug })}`
}

// The query of the current address (?campus=…, or none), kept when opening a building and coming
// back, so the map is not loaded again (RF-MAPA-19).
function useMapQuery() {
  return useLocation().search
}

function describe(indicator: Indicator) {
  const count = plural(indicator.openCount, 'reporte abierto', 'reportes abiertos')
  return indicator.level ? `${count} · Nivel ${LEVEL_LABEL[indicator.level].toLowerCase()}` : count
}

// The plan of the campus with an indicator per building (SDD 13.4, DD-12): Leaflet in
// CRS.Simple with the plan as an image layer, so zooming and panning keep each indicator on its
// building (RF-MAPA-12, 13). Positions are plan coordinates with y from the bottom edge.
function PlanMap({ data, className }: { data: MapData; className: string }) {
  const { map } = data
  const query = useMapQuery()
  const bounds: LatLngBoundsExpression = [
    [0, 0],
    [map.floorPlan.height, map.floorPlan.width],
  ]
  return (
    <div role="region" aria-label={`Plano del ${map.campus.name}`} className={className}>
      <MapContainer
        crs={CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        maxBoundsViscosity={0.8}
        minZoom={-4}
        maxZoom={2}
        zoomSnap={0.25}
        zoomControl={false}
        attributionControl={false}
        // Leaflet paints its own gray behind the plan; the canvas color of the frames instead.
        className="size-full"
        style={{ background: 'var(--color-canvas)' }}
      >
        <ImageOverlay url={map.floorPlan.url} bounds={bounds} />
        <ZoomControl position="topright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
        {map.indicators.map((indicator) => (
          <Marker
            key={indicator.building.id}
            position={[indicator.position.y, indicator.position.x]}
            // The list under the map is the keyboard and screen reader way in (RF-MAPA-15).
            keyboard={false}
            icon={divIcon({
              className: '',
              iconSize: [40, 40],
              iconAnchor: [20, 20],
              html: `<span class="flex size-10 items-center justify-center text-base font-bold shadow-sm ${markerStyle[indicator.level ?? 'none']}">${indicator.openCount}</span>`,
            })}
          >
            {/* Selecting an indicator shows the name of its building (manual 4.8). */}
            <Popup>
              <span className="flex flex-col gap-1 font-sans">
                <strong className="text-sm">{indicator.building.name}</strong>
                <span className="text-xs text-neutral-text-muted">{describe(indicator)}</span>
                <Link
                  to={`/mapa/edificios/${indicator.building.id}${query}`}
                  className="text-xs font-semibold text-green underline"
                >
                  Ver reportes abiertos
                </Link>
              </span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  )
}

// RF-MAPA-10: ranges from the campus thresholds; none without thresholds (RF-MAPA-09).
function Legend({ data, desktop }: { data: MapData; desktop: boolean }) {
  const legend = data.map.legend
  if (!legend) return null
  if (desktop) {
    return (
      <Card as="ul" aria-label="Leyenda de niveles" className="flex flex-wrap gap-6 px-4 py-3">
        {legend.map(({ level, min, max }) => (
          <li key={level} className="flex items-center gap-2 text-xs font-medium text-neutral-text">
            <span aria-hidden="true" className={cn('size-4', markerStyle[level])} />
            {LEVEL_LABEL[level]}: {range(min, max)}
          </li>
        ))}
      </Card>
    )
  }
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Leyenda de niveles">
      {legend.map(({ level, min, max }) => (
        <li key={level}>
          <LevelBadge level={level}>
            {LEVEL_LABEL[level]}: {range(min, max)}
          </LevelBadge>
        </li>
      ))}
    </ul>
  )
}

// Text alternative to the plan (RF-MAPA-15): the same buildings, as links to their reports.
function BuildingList({ data, desktop }: { data: MapData; desktop: boolean }) {
  const { map } = data
  const query = useMapQuery()
  const buildings = [...map.indicators].sort((a, b) => b.openCount - a.openCount)
  return (
    <section className="flex flex-col gap-2 lg:gap-3" aria-labelledby="map-list">
      <SectionLabel id="map-list" className="lg:mt-1">
        Edificios con reportes abiertos
      </SectionLabel>
      {buildings.length === 0 ? (
        <p className="text-body text-neutral-text-muted">No hay reportes abiertos.</p>
      ) : (
        <ul className="flex flex-col gap-2 lg:gap-3">
          {buildings.map((b) => (
            <li key={b.building.id}>
              <Link
                to={`/mapa/edificios/${b.building.id}${query}`}
                className={cn(
                  'flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
                  desktop
                    ? 'rounded-xl border border-card-border bg-neutral-white px-4 py-3.5 hover:border-green'
                    : 'rounded-card border border-neutral-border px-3 py-3 hover:bg-neutral-surface',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center text-sm font-bold',
                    markerStyle[b.level ?? 'none'],
                  )}
                >
                  {b.openCount}
                </span>
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-bold text-neutral-text">{b.building.name}</span>
                  <span className="text-caption text-neutral-text-muted">{describe(b)}</span>
                </span>
                <ChevronRightIcon className="size-5 text-neutral-text-secondary" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// /mapa/edificios/:buildingId — open reports of a building, in the order of the consultation
// (RF-MAPA-16…18). Coming back to the map does not reload it (RF-MAPA-19).
export function BuildingReports() {
  const { buildingId, reports } = useLoaderData<typeof buildingReportsLoader>()
  const data = useRouteLoaderData<typeof mapLoader>('map')
  const query = useMapQuery()
  const building = data?.map.indicators.find((i) => i.building.id === buildingId)?.building
  const name = building?.name ?? reports[0]?.building.name ?? 'Edificio'

  return (
    <section className="flex flex-col gap-3" aria-labelledby="building-title">
      <Link
        to={`/mapa${query}`}
        className="flex w-fit items-center gap-1.5 rounded-chip text-sm font-semibold text-green hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <ArrowLeftIcon className="size-4" />
        Volver al mapa
      </Link>
      <h2 id="building-title" className="text-heading font-bold text-neutral-text">
        {name} · {plural(reports.length, 'reporte abierto', 'reportes abiertos')}
      </h2>
      {reports.length === 0 ? (
        <p className="text-body text-neutral-text-muted">Este edificio ya no tiene reportes abiertos.</p>
      ) : (
        <div className="flex flex-col gap-2.5">
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} href={`/reportes/${report.id}`} />
          ))}
        </div>
      )}
    </section>
  )
}

// /mapa — Figma frame D "Mapa del campus" and "Mapa · Encargado · Escritorio".
export function MapPage() {
  const data = useLoaderData<typeof mapLoader>()
  const navigate = useNavigate()
  const outlet = useOutlet()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const { campus, campuses, map } = data
  const side = outlet ?? <BuildingList data={data} desktop={isDesktop} />

  // RF-MAPA-03: the campus selector only appears with more than one active campus.
  const selector = campuses.length > 1 && (
    <Select
      size="sm"
      aria-label="Campus"
      options={campuses.map((c) => ({ value: c.slug, label: c.name }))}
      value={campus.slug}
      onChange={(e) => navigate(`/mapa${campusQuery(e.target.value)}`)}
      className={isDesktop ? 'w-64 border-card-border bg-neutral-white py-2.5 text-sm' : undefined}
    />
  )
  // RF-MAPA-11
  const unplaced = map.noPositionedBuildings && (
    <Notice tone="info" className="text-body">
      Ningún edificio del campus está ubicado en el plano todavía.
    </Notice>
  )
  // The map does not update by itself (RF-MAPA-20).
  const note = (
    <p className="text-xs text-neutral-text-muted">
      El mapa muestra los reportes abiertos al momento de abrirlo. Recarga la página para ver cambios.
    </p>
  )

  if (isDesktop) {
    return (
      <NavScreen title={`Mapa · ${map.campus.name}`} desktopTitle="Mapa" subtitle={map.campus.name}>
        <div className="grid grid-cols-[minmax(0,1fr)_400px] items-start gap-8 px-10 py-8">
          <div className="flex flex-col gap-3">
            {selector}
            {unplaced}
            <Card className="overflow-hidden">
              <PlanMap data={data} className="h-[calc(100dvh-17rem)] min-h-96" />
            </Card>
            <Legend data={data} desktop />
            {note}
          </div>
          {side}
        </div>
      </NavScreen>
    )
  }

  return (
    <NavScreen title={`Mapa · ${map.campus.name}`}>
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {selector}
        {unplaced}
        <PlanMap data={data} className="aspect-4/3 overflow-hidden rounded-card border border-neutral-border" />
        <Legend data={data} desktop={false} />
        {note}
        {side}
      </div>
    </NavScreen>
  )
}
