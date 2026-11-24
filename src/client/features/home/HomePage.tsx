import { useEffect } from 'react'
import { useLoaderData, useRevalidator } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { ButtonLink } from '../../components/ui/Button'
import { ReportCard } from '../../components/ui/ReportCard'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import { compareReports, isOpen } from '../../lib/reports'
import type { homeLoader } from './data'

// / — entry point to reporting, the report list and the map (SDD 13.2).
// Phone: intro and three buttons. Desktop (lg): a small dashboard with the counts,
// the most urgent open reports and the same three actions in a side panel.
export function HomePage() {
  const { reports } = useLoaderData<typeof homeLoader>()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const revalidator = useRevalidator()

  // The loader skips the reports on a phone; load them if the window grows to desktop.
  useEffect(() => {
    if (isDesktop && reports === null && revalidator.state === 'idle') {
      void revalidator.revalidate()
    }
  }, [isDesktop, reports, revalidator])

  const stats = reports && [
    { label: 'Abiertos', value: reports.filter(isOpen).length },
    { label: 'Nuevos', value: reports.filter((r) => r.status === 'new').length },
    { label: 'En revisión', value: reports.filter((r) => r.status === 'in_review').length },
    { label: 'Resueltos', value: reports.filter((r) => r.status === 'resolved').length },
  ]
  // compareReports puts the most urgent first (RF-GESTION-14).
  const urgent = reports && reports.filter(isOpen).sort(compareReports).slice(0, 4)

  return (
    <>
      <ScreenHeader title="Cima Fix" />
      <div className="flex flex-col gap-3 px-4 py-6 lg:mx-auto lg:w-full lg:max-w-7xl lg:gap-8 lg:px-8 lg:py-8">
        <p className="text-body text-neutral-text-secondary lg:text-base">
          Reporta un problema del campus o revisa en qué va.
        </p>

        {stats && (
          <dl className="hidden lg:grid lg:grid-cols-4 lg:gap-4">
            {stats.map(({ label, value }) => (
              <div key={label} className="rounded-card border border-neutral-border p-5">
                <dt className="text-body text-neutral-text-muted">{label}</dt>
                <dd className="mt-1 text-3xl font-medium text-green-dark">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
          {urgent && (
            <section className="hidden lg:flex lg:flex-col lg:gap-3">
              <h2 className="text-caption font-medium tracking-wide text-neutral-text-secondary uppercase">
                Reportes abiertos más urgentes
              </h2>
              {urgent.length === 0 ? (
                <p className="text-body text-neutral-text-muted">No hay reportes abiertos.</p>
              ) : (
                <div className="grid grid-cols-2 items-start gap-4">
                  {urgent.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      variant="list"
                      href={`/reportes/${report.id}`}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          <div className="flex flex-col gap-3 lg:rounded-card lg:border lg:border-neutral-border lg:p-5">
            <h2 className="hidden text-caption font-medium tracking-wide text-neutral-text-secondary uppercase lg:block">
              Acciones
            </h2>
            <ButtonLink to="/reportar">Reportar un problema</ButtonLink>
            <ButtonLink to="/reportes" variant="secondary">
              Ver reportes
            </ButtonLink>
            <ButtonLink to="/mapa" variant="secondary">
              Ver mapa del campus
            </ButtonLink>
          </div>
        </div>
      </div>
    </>
  )
}
