import { useState, type ReactNode } from 'react'
import { Form, Outlet, useLoaderData, useNavigation, useSubmit } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Notice } from '../../components/ui/Notice'
import { AlertTriangleIcon, ImageIcon, MapPinIcon } from '../../components/ui/icons'
import { CURRENT_USER } from '../../lib/demo-api'
import { formatDateTime, formatLongDateTime, formatNumber, plural } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import { isOpen, type Report } from '../../lib/reports'
import { sessionRole, useSession } from '../../lib/session'
import type { reportDetailLoader } from './data'

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-neutral-border py-2 text-xs last:border-b-0">
      <dt className="text-neutral-text-muted">{label}</dt>
      <dd className="text-right break-all text-neutral-text">{value}</dd>
    </div>
  )
}

// Row of the desktop info card: label column and value column.
function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-3 py-2">
      <dt className="text-xs text-neutral-text-muted">{label}</dt>
      <dd className="text-xs break-all text-neutral-text">{children}</dd>
    </div>
  )
}

function Photos({ report, className }: { report: Report; className: string }) {
  if (report.photoCount === 0) return null
  return (
    <div className={className}>
      {Array.from({ length: report.photoCount }, (_, i) => (
        <div
          key={i}
          role="img"
          aria-label={`Foto ${i + 1} del reporte`}
          className="flex aspect-4/3 items-center justify-center rounded-control border border-neutral-border bg-green-surface text-green-dark lg:rounded-xl lg:border-0"
        >
          <ImageIcon className="size-6 lg:size-7" />
        </div>
      ))}
    </div>
  )
}

// Figma "Modal · Cancelar reporte · Escritorio", on every screen size.
function CancelDialog({ onConfirm, onClose, busy }: { onConfirm: () => void; onClose: () => void; busy: boolean }) {
  return (
    <Dialog labelledBy="cancel-title" describedBy="cancel-text" onClose={onClose}>
      <div className="flex flex-col items-center gap-3 px-6 pt-6 pb-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-status-error-bg text-status-error">
          <AlertTriangleIcon className="size-6" />
        </span>
        <h2 id="cancel-title" className="text-heading font-bold">
          ¿Cancelar este reporte?
        </h2>
        <p id="cancel-text" className="text-body text-neutral-text-secondary">
          El reporte pasará a Cancelado y dejará de ser visible para quien lo registró. Se enviará un
          correo a esa persona, a quien lo tiene asignado y a quienes confirmaron el duplicado. No se
          puede deshacer.
        </p>
        <div className="mt-2 flex w-full flex-col gap-2.5">
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Cancelando…' : 'Sí, cancelar reporte'}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            No, volver
          </Button>
        </div>
      </div>
    </Dialog>
  )
}

// /reportes/:id — Figma frame B "Detalle del reporte" and the "Detalle · … · Escritorio"
// frames. The assign dialog renders in <Outlet />.
export function ReportDetailPage() {
  const { report } = useLoaderData<typeof reportDetailLoader>()
  const session = useSession()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const navigation = useNavigation()
  const submit = useSubmit()
  const [cancelling, setCancelling] = useState(false)
  const busy = navigation.state === 'submitting'
  const assignedToMe = report.assignee === CURRENT_USER
  // Only Encargados take reports (RF-GESTION-06); an Admin assigns them to someone.
  const canTakeIt = sessionRole(session) === 'staff'

  const assigneeText = !report.assignee ? 'Sin asignar' : assignedToMe ? 'Tú' : report.assignee

  function confirmCancel() {
    void submit({ intent: 'cancel' }, { method: 'post' }).then(() => setCancelling(false))
  }

  const cancelButton = (
    <Button variant="danger" onClick={() => setCancelling(true)} disabled={busy} className={isDesktop ? 'py-2.5 text-sm' : undefined}>
      Cancelar reporte
    </Button>
  )

  // Actions: primary action first, then the secondary ones (side by side on desktop).
  const actions = isOpen(report) && (
    <Form method="post" className="flex flex-col gap-2.5">
      {report.status === 'new' ? (
        <>
          {canTakeIt && (
            <>
              <input type="hidden" name="assignee" value={CURRENT_USER} />
              <Button type="submit" name="intent" value="assign" disabled={busy} className={isDesktop ? 'py-2.5 text-sm' : undefined}>
                Asignarme este reporte
              </Button>
            </>
          )}
          <div className={isDesktop ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
            <ButtonLink to="asignar" variant={canTakeIt ? 'secondary' : 'primary'} className={isDesktop ? 'py-2.5 text-sm' : undefined}>
              Asignar a…
            </ButtonLink>
            {cancelButton}
          </div>
        </>
      ) : (
        <>
          {/* RF-GESTION: only the assigned person can resolve. */}
          <Button type="submit" name="intent" value="resolve" disabled={busy || !assignedToMe} className={isDesktop ? 'py-2.5 text-sm' : undefined}>
            Marcar como resuelto
          </Button>
          <div className={isDesktop ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
            <ButtonLink to="asignar" variant="secondary" className={isDesktop ? 'py-2.5 text-sm' : undefined}>
              Reasignar…
            </ButtonLink>
            {cancelButton}
          </div>
        </>
      )}
    </Form>
  )

  return (
    <>
      <ScreenHeader
        title="Reporte"
        desktopTitle="Detalle del reporte"
        subtitle={report.campus}
        backTo="/reportes"
        backLabel="Volver a los reportes"
      />

      {isDesktop ? (
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-8 px-10 py-8">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
              <PriorityBadge priority={report.priority} />
              <StatusBadge status={report.status} />
            </div>
            <h2 className="text-[34px] leading-tight font-bold text-neutral-text">{report.category}</h2>
            <p className="flex items-center gap-1.5 text-body text-neutral-text-secondary">
              <MapPinIcon className="size-4.5" />
              {report.space} · {report.building} · {report.campus}
            </p>
            <Photos report={report} className="grid max-w-xl grid-cols-2 gap-4" />
            <Card className="flex flex-col gap-1.5 px-5 py-4">
              <h3 className="text-xs text-neutral-text-muted">Descripción</h3>
              <p className="text-base text-neutral-text">{report.description}</p>
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card as="dl" className="px-5 py-3">
              <InfoRow label="Categoría">
                <span className="font-semibold">{report.category}</span>
              </InfoRow>
              <InfoRow label="Creado">
                <span className="font-semibold">{formatLongDateTime(report.createdAt)}</span>
              </InfoRow>
              {report.resolvedAt && (
                <InfoRow label="Resuelto">
                  <span className="font-semibold">{formatLongDateTime(report.resolvedAt)}</span>
                </InfoRow>
              )}
              <InfoRow label="Confirmaciones">
                <span className="font-semibold">
                  {plural(report.confirmations, 'duplicado confirmado', 'duplicados confirmados')}
                </span>
              </InfoRow>
              <InfoRow label="Reportó">
                <span className="font-semibold">{report.reporterEmail}</span>
                <span className="block text-caption text-neutral-text-muted">
                  Visible solo para el personal del campus
                </span>
              </InfoRow>
              <InfoRow label="Asignado a">
                {!report.assignee ? (
                  <span className="text-neutral-text-muted">Sin asignar</span>
                ) : (
                  <span className="font-semibold">
                    {report.assignee}
                    {assignedToMe && ' (tú)'}
                  </span>
                )}
              </InfoRow>
            </Card>
            {actions && <Card className="p-3.5">{actions}</Card>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          <Photos report={report} className="grid grid-cols-2 gap-2" />

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
          {actions}
        </div>
      )}

      {cancelling && (
        <CancelDialog busy={busy} onConfirm={confirmCancel} onClose={() => setCancelling(false)} />
      )}
      <Outlet />
    </>
  )
}
