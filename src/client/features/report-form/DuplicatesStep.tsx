import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { Button, ButtonNote } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { ReportCard } from '../../components/ui/ReportCard'
import { confirmReport } from '../../lib/demo-api'
import type { Report } from '../../lib/reports'

type DuplicatesStepProps = {
  building: string
  similar: Report[]
  busy: boolean
  onBack: () => void
  onContinue: () => void
}

// Figma frame 2 "Posibles duplicados" (RF-DUPLICADO-01…07, SDD 8.2).
// `similar` already comes in the RF-GESTION-14 order (RF-DUPLICADO-07).
export function DuplicatesStep({ building, similar, busy, onBack, onContinue }: DuplicatesStepProps) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<string>()
  const [error, setError] = useState<string>()

  async function confirm(report: Report) {
    setConfirming(report.id)
    setError(undefined)
    try {
      await confirmReport(report.id)
      // RF-DUPLICADO-03 / RF-REPORTE-14: the confirmation replaces the new report;
      // show the confirmed one.
      navigate(`/reportes/${report.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pudimos registrar la confirmación.')
      setConfirming(undefined)
    }
  }

  return (
    <>
      <ScreenHeader
        title="¿Es el mismo problema?"
        onBack={onBack}
        backLabel="Volver al formulario"
      />

      <div className="flex flex-col gap-3 px-4 py-3.5 lg:mx-auto lg:my-8 lg:w-full lg:max-w-5xl lg:rounded-card lg:border lg:border-neutral-border lg:p-8">
        <p className="text-body text-neutral-text-secondary">
          Hay reportes abiertos parecidos en el {building}. Si es el tuyo, confírmalo en vez de
          crear otro.
        </p>

        <div className="flex flex-col gap-3 lg:grid lg:grid-cols-2 lg:items-start lg:gap-4">
        {similar.map((report) => (
          <ReportCard key={report.id} report={report}>
            {/* RF-DUPLICADO-05 (SDD 8.2): no confirm button on your own report or on one
                you already confirmed, only the reason. */}
            {report.reportedByMe ? (
              <ButtonNote>Tú registraste este reporte</ButtonNote>
            ) : report.confirmedByMe ? (
              <ButtonNote>Ya lo confirmaste</ButtonNote>
            ) : (
              <Button
                variant="secondary"
                disabled={confirming !== undefined || busy}
                onClick={() => confirm(report)}
              >
                {confirming === report.id ? 'Confirmando…' : 'Es el mismo problema'}
              </Button>
            )}
          </ReportCard>
        ))}
        </div>

        {error && (
          <Notice tone="error" className="text-body">
            {error}
          </Notice>
        )}

        <Button disabled={busy || confirming !== undefined} onClick={onContinue} className="mt-1 lg:w-auto lg:self-end lg:px-10">
          {busy ? 'Enviando…' : 'Ninguno es mi problema, continuar'}
        </Button>
      </div>
    </>
  )
}
