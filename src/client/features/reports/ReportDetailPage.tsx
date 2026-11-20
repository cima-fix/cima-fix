import { Form, Outlet, useLoaderData, useNavigation } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Notice } from '../../components/ui/Notice'
import { ImageIcon } from '../../components/ui/icons'
import { CURRENT_USER } from '../../lib/demo-api'
import { formatDateTime, formatNumber } from '../../lib/format'
import { isOpen } from '../../lib/reports'
import type { reportDetailLoader } from './data'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-border py-2 text-xs last:border-b-0">
      <dt className="text-neutral-text-muted">{label}</dt>
      <dd className="text-right break-all text-neutral-text">{value}</dd>
    </div>
  )
}

// /reportes/:id — Figma frame B "Detalle del reporte". The assign sheet renders in <Outlet />.
export function ReportDetailPage() {
  const { report } = useLoaderData<typeof reportDetailLoader>()
  const navigation = useNavigation()
  const busy = navigation.state === 'submitting'
  const assignedToMe = report.assignee === CURRENT_USER

  const assigneeText = !report.assignee ? 'Sin asignar' : assignedToMe ? 'Tú' : report.assignee

  return (
    <>
      <ScreenHeader title="Reporte" backTo="/reportes" />
      <div className="flex flex-col gap-3 px-4 py-3.5">
        {report.photoCount > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: report.photoCount }, (_, i) => (
              <div
                key={i}
                role="img"
                aria-label={`Foto ${i + 1} del reporte`}
                className="flex aspect-4/3 items-center justify-center rounded-control border border-neutral-border bg-green-surface text-green-dark"
              >
                <ImageIcon className="size-6" />
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-1">
          <h2 className="text-base font-medium text-neutral-text">
            {report.building} · {report.space}
          </h2>
          <p className="text-xs text-neutral-text-muted">
            {report.campus} · {report.category}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <StatusBadge status={report.status} />
          <PriorityBadge priority={report.priority} />
        </div>

        <p className="text-body text-neutral-text-secondary">{report.description}</p>

        <dl>
          <Row label="Creado" value={formatDateTime(report.createdAt)} />
          {report.resolvedAt && <Row label="Resuelto" value={formatDateTime(report.resolvedAt)} />}
          <Row label="Confirmaciones" value={formatNumber(report.confirmations)} />
          <Row label="Reportó" value={report.reporterEmail} />
          <Row label="Asignado a" value={assigneeText} />
        </dl>

        <Notice tone="info">La prioridad se calcula sola y no se puede editar.</Notice>

        {isOpen(report) && (
          <Form
            method="post"
            className="flex flex-col gap-2.5"
            onSubmit={(event) => {
              const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
              if (
                submitter?.value === 'cancel' &&
                !window.confirm('¿Cancelar este reporte? Esta acción no se puede deshacer.')
              ) {
                event.preventDefault()
              }
            }}
          >
            {report.status === 'new' ? (
              <ButtonLink to="asignar">Asignar</ButtonLink>
            ) : (
              <>
                {/* RF-GESTION: only the assigned person can resolve. */}
                <Button type="submit" name="intent" value="resolve" disabled={busy || !assignedToMe}>
                  Marcar como resuelto
                </Button>
                <ButtonLink to="asignar" variant="secondary">
                  Reasignar
                </ButtonLink>
              </>
            )}
            <Button type="submit" name="intent" value="cancel" variant="outline" disabled={busy}>
              Cancelar reporte
            </Button>
          </Form>
        )}
      </div>
      <Outlet />
    </>
  )
}
