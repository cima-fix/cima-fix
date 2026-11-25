import { useState, type ReactNode } from 'react'
import { Form, Outlet, useActionData, useLoaderData, useNavigation, useSubmit } from 'react-router'
import { ScreenHeader } from '../../components/layout/ScreenHeader'
import { PriorityBadge, StatusBadge } from '../../components/ui/Badge'
import { Button, ButtonLink } from '../../components/ui/Button'
import { Card } from '../../components/ui/Card'
import { Dialog } from '../../components/ui/Dialog'
import { Notice } from '../../components/ui/Notice'
import { AlertTriangleIcon, ImageIcon, MapPinIcon } from '../../components/ui/icons'
import { cn } from '../../lib/cn'
import { formatDateTime, formatLongDateTime, formatNumber, plural } from '../../lib/format'
import { DESKTOP_QUERY, useMediaQuery } from '../../lib/media'
import type { Report } from '../../lib/reports'
import { sessionRole, useSession } from '../../lib/session'
import type { ReportActionResult, reportDetailLoader } from './data'

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

// A photo of the report. When Cloudinary does not answer, the rest of the report still shows
// (SDD 12, RNF-DISPONIBILIDAD-04).
function Photo({ url, index }: { url: string; index: number }) {
  const [failed, setFailed] = useState(false)
  const tile =
    'flex aspect-4/3 items-center justify-center overflow-hidden rounded-control border border-neutral-border bg-green-surface text-green-dark lg:rounded-xl lg:border-0'
  if (failed) {
    return (
      <div className={cn(tile, 'flex-col gap-1 p-2 text-center text-xs')}>
        <ImageIcon className="size-6" />
        Fotografía no disponible
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={cn(tile, 'focus-visible:outline-2 focus-visible:outline-green')}>
      <img
        src={url}
        alt={`Foto ${index + 1} del reporte`}
        onError={() => setFailed(true)}
        className="size-full object-cover"
      />
    </a>
  )
}

function Photos({ report, className }: { report: Report; className: string }) {
  if (report.photos.length === 0) return null
  return (
    <div className={className}>
      {report.photos.map((photo, i) => (
        <Photo key={photo.url} url={photo.thumbnailUrl} index={i} />
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
  const result = useActionData<ReportActionResult>()
  const session = useSession()
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const navigation = useNavigation()
  const submit = useSubmit()
  const [cancelling, setCancelling] = useState(false)
  const busy = navigation.state === 'submitting'
  const actions = report.allowedActions
  const assignedToMe = report.assigneeEmail === session.email
  // Only Encargados take reports (RF-GESTION-06); an Admin assigns them to someone.
  const canTakeIt =
    actions.includes('assign') && sessionRole(session, report.campus.id) === 'staff' && !assignedToMe
  const small = isDesktop ? 'py-2.5 text-sm' : undefined

  function confirmCancel() {
    void submit({ intent: 'cancel' }, { method: 'post' }).then(() => setCancelling(false))
  }

  const secondary = [
    actions.includes('assign') && (
      <ButtonLink
        key="assign"
        to="asignar"
        variant={canTakeIt || actions.includes('resolve') ? 'secondary' : 'primary'}
        className={small}
      >
        {report.status === 'new' ? 'Asignar a…' : 'Reasignar…'}
      </ButtonLink>
    ),
    actions.includes('cancel') && (
      <Button key="cancel" variant="danger" onClick={() => setCancelling(true)} disabled={busy} className={small}>
        Cancelar reporte
      </Button>
    ),
  ].filter(Boolean)

  // Primary action first, then the others (side by side on desktop). The API's allowedActions
  // decides which ones appear; it checks them again when they run (SDD 7.3).
  const actionForm = actions.some((a) => a !== 'confirm') && (
    <Form method="post" className="flex flex-col gap-2.5">
      {actions.includes('resolve') ? (
        <Button type="submit" name="intent" value="resolve" disabled={busy} className={small}>
          Marcar como resuelto
        </Button>
      ) : (
        canTakeIt && (
          <>
            <input type="hidden" name="assigneeId" value={session.accountId} />
            <Button type="submit" name="intent" value="assign" disabled={busy} className={small}>
              {report.status === 'new' ? 'Asignarme este reporte' : 'Reasignarme este reporte'}
            </Button>
          </>
        )
      )}
      {secondary.length > 0 && (
        <div className={isDesktop && secondary.length === 2 ? 'grid grid-cols-2 gap-2.5' : 'flex flex-col gap-2.5'}>
          {secondary}
        </div>
      )}
    </Form>
  )

  // Figma "Detalle · Aviso de conflicto": someone changed the report meanwhile (SDD 8.3); the
  // page already shows it reloaded.
  const notice = result?.error && !busy && (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-2.5 rounded-control px-4 py-3 text-body',
        result.conflict
          ? 'border border-status-error bg-status-error-bg text-status-error'
          : 'bg-status-error text-neutral-white',
      )}
    >
      <AlertTriangleIcon className="size-4.5 shrink-0" />
      <p>
        {result.error}
        {result.conflict && ' Actualizamos la información.'}
      </p>
    </div>
  )

  // RN-04: without the emails (a Reportante), the rows are not shown at all.
  const assignee =
    report.assigneeEmail === undefined
      ? undefined
      : report.assigneeEmail === null
        ? 'Sin asignar'
        : assignedToMe
          ? 'Tú'
          : report.assigneeEmail

  return (
    <>
      <ScreenHeader
        title="Reporte"
        desktopTitle="Detalle del reporte"
        subtitle={report.campus.name}
        backTo="/reportes"
        backLabel="Volver a los reportes"
      />

      {isDesktop ? (
        <div className="flex flex-col gap-5 px-10 py-8">
          {notice}
          <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] items-start gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <PriorityBadge priority={report.priority} />
                <StatusBadge status={report.status} />
              </div>
              <h2 className="text-[34px] leading-tight font-bold text-neutral-text">{report.category.name}</h2>
              <p className="flex items-center gap-1.5 text-body text-neutral-text-secondary">
                <MapPinIcon className="size-4.5" />
                {report.space.name} · {report.building.name} · {report.campus.name}
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
                  <span className="font-semibold">{report.category.name}</span>
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
                    {plural(report.confirmationCount, 'duplicado confirmado', 'duplicados confirmados')}
                  </span>
                </InfoRow>
                {report.reporterEmail !== undefined && (
                  <InfoRow label="Reportó">
                    <span className="font-semibold">{report.reporterEmail}</span>
                    <span className="block text-caption text-neutral-text-muted">
                      Visible solo para el personal del campus
                    </span>
                  </InfoRow>
                )}
                {report.assigneeEmail !== undefined && (
                  <InfoRow label="Asignado a">
                    {!report.assigneeEmail ? (
                      <span className="text-neutral-text-muted">Sin asignar</span>
                    ) : (
                      <span className="font-semibold">
                        {report.assigneeEmail}
                        {assignedToMe && ' (tú)'}
                      </span>
                    )}
                  </InfoRow>
                )}
              </Card>
              {actionForm && <Card className="p-3.5">{actionForm}</Card>}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 px-4 py-3.5">
          {notice}
          <Photos report={report} className="grid grid-cols-2 gap-2" />

          <div className="flex flex-col gap-1">
            <h2 className="text-base font-medium text-neutral-text">
              {report.building.name} · {report.space.name}
            </h2>
            <p className="text-xs text-neutral-text-muted">
              {report.campus.name} · {report.category.name}
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
            <Row label="Confirmaciones" value={formatNumber(report.confirmationCount)} />
            {report.reporterEmail !== undefined && <Row label="Reportó" value={report.reporterEmail} />}
            {assignee !== undefined && <Row label="Asignado a" value={assignee} />}
          </dl>

          <Notice tone="info">La prioridad se calcula sola y no se puede editar.</Notice>
          {actionForm}
        </div>
      )}

      {cancelling && (
        <CancelDialog busy={busy} onConfirm={confirmCancel} onClose={() => setCancelling(false)} />
      )}
      <Outlet />
    </>
  )
}
