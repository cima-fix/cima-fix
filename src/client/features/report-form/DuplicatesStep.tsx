import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Button } from '../../components/ui/Button'
import { ReportCard } from '../../components/ui/ReportCard'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { confirmReport } from '../../lib/demo-api'
import type { Report } from '../../lib/reports'

type DuplicatesStepProps = {
  building: string
  similar: Report[]
  busy: boolean
  onBack: () => void
  onContinue: () => void
}

// Figma frame 2 "Posibles duplicados" (RF-DUPLICADO-01…04).
export function DuplicatesStep({ building, similar, busy, onBack, onContinue }: DuplicatesStepProps) {
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState<string>()

  async function confirm(report: Report) {
    setConfirming(report.id)
    await confirmReport(report.id)
    // RF-DUPLICADO-03: the confirmation replaces the new report; show the one confirmed.
    navigate(`/reportes/${report.id}`)
  }

  return (
    <>
      <ScreenHeader
        title="¿Es el mismo problema?"
        onBack={onBack}
        backLabel="Volver al formulario"
      />

      <div className="flex flex-col gap-3 px-4 py-3.5">
        <p className="text-body text-neutral-text-secondary">
          Hay reportes abiertos parecidos en el {building}. Si es el tuyo, confírmalo en vez de
          crear otro.
        </p>

        {similar.map((report) => (
          <ReportCard key={report.id} report={report}>
            {report.confirmedByMe ? (
              <Button variant="muted" disabled>
                Ya lo confirmaste
              </Button>
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

        <Button disabled={busy || confirming !== undefined} onClick={onContinue} className="mt-1">
          {busy ? 'Enviando…' : 'Ninguno es mi problema, continuar'}
        </Button>
      </div>
    </>
  )
}
