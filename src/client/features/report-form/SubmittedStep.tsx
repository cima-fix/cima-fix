import { useEffect, useRef } from 'react'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { Button, ButtonLink } from '../../components/ui/Button'
import { ReportCard } from '../../components/ui/ReportCard'
import { CheckIcon } from '../../components/ui/icons'
import type { Report } from '../../lib/reports'

type SubmittedStepProps = {
  report: Report
  onNewReport: () => void
}

// Figma frame 4 "Confirmación".
export function SubmittedStep({ report, onNewReport }: SubmittedStepProps) {
  const heading = useRef<HTMLHeadingElement>(null)

  // Move focus to the result so screen readers announce it.
  useEffect(() => heading.current?.focus(), [])

  return (
    <>
      <ScreenHeader title="Reporte enviado" backTo="/reportes" backLabel="Ir a los reportes" />
      <div className="flex flex-col gap-3 px-4 py-6 lg:mx-auto lg:my-10 lg:w-full lg:max-w-xl lg:rounded-xl lg:border lg:border-card-border lg:bg-neutral-white lg:p-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-green text-neutral-white">
            <CheckIcon className="size-6" strokeWidth={2.5} />
          </span>
          <h2 ref={heading} tabIndex={-1} className="mt-2 text-heading font-medium outline-none">
            Listo, registramos tu reporte
          </h2>
          <p className="text-body text-neutral-text-secondary">
            Te avisaremos por correo cuando se resuelva.
          </p>
        </div>

        <ReportCard
          report={report}
          location={`${report.building}, ${report.campus}`}
          href={`/reportes/${report.id}`}
        />

        <ButtonLink to="/reportes" className="mt-1">
          Ver todos los reportes
        </ButtonLink>
        <Button variant="secondary" onClick={onNewReport}>
          Hacer otro reporte
        </Button>
      </div>
    </>
  )
}
