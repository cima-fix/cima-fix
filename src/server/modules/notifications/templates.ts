import type { OpenStatus, StaffRole } from '../../../shared/types/common.ts'
import type { Email } from '../../integrations/mailer.ts'

// Email templates (SDD 14.2): simple HTML plus a plain text version, in Spanish
// (RNF-USABILIDAD-03), with dates in America/Tijuana (DD-17, RNF-USABILIDAD-04). No template
// includes the email of any person (SDD 11, RF-NOTIFICACION-11).

export const TIME_ZONE = 'America/Tijuana'

const dateTime = new Intl.DateTimeFormat('es-MX', { timeZone: TIME_ZONE, dateStyle: 'long', timeStyle: 'short' })

export function formatDateTime(date: Date): string {
  return dateTime.format(date)
}

const ROLE_LABELS: Record<StaffRole, string> = { staff: 'Encargado', admin: 'Admin' }
const STATUS_LABELS: Record<OpenStatus, string> = { new: 'Nuevo', in_review: 'En revisión' }

// Catalog names are typed by admins: they are escaped before going into the HTML.
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// RF-NOTIFICACION-06: the location and category of the report.
export type ReportFacts = {
  campus: string
  building: string
  space: string
  category: string
  createdAt: Date
}

type Body = { paragraphs: string[]; details?: [string, string][]; link?: { url: string; label: string } }

const FOOTER = 'Este correo lo envió Cima Fix de forma automática. No respondas a este mensaje.'

function render(to: string, subject: string, body: Body): Email {
  const html = [
    ...body.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    body.details
      ? `<ul>${body.details.map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`).join('')}</ul>`
      : '',
    body.link ? `<p><a href="${escapeHtml(body.link.url)}">${escapeHtml(body.link.label)}</a></p>` : '',
    `<p style="color:#6b7280;font-size:12px">${escapeHtml(FOOTER)}</p>`,
  ].join('\n')

  const text = [
    ...body.paragraphs,
    ...(body.details ? [body.details.map(([label, value]) => `- ${label}: ${value}`).join('\n')] : []),
    ...(body.link ? [`${body.link.label}: ${body.link.url}`] : []),
    FOOTER,
  ].join('\n\n')

  return { to, subject, html, text }
}

function reportDetails(report: ReportFacts): [string, string][] {
  return [
    ['Campus', report.campus],
    ['Edificio', report.building],
    ['Espacio', report.space],
    ['Categoría', report.category],
    ['Registrado', formatDateTime(report.createdAt)],
  ]
}

const reportLink = (url: string) => ({ url, label: 'Ver el reporte' })

// RF-NOTIFICACION-01, 06, 07
export function reportAssignedEmail(to: string, report: ReportFacts, link: string): Email {
  return render(to, `Se te asignó un reporte en ${report.campus}`, {
    paragraphs: ['Se te asignó un reporte para que le des seguimiento.'],
    details: reportDetails(report),
    link: reportLink(link),
  })
}

// RF-NOTIFICACION-02, 06, 07
export function reportResolvedEmail(to: string, report: ReportFacts, link: string): Email {
  return render(to, `Se resolvió un reporte en ${report.campus}`, {
    paragraphs: ['Se resolvió un reporte que registraste o que confirmaste como el mismo problema.'],
    details: reportDetails(report),
    link: reportLink(link),
  })
}

// RF-NOTIFICACION-03, 06, 08: the link only for a recipient that can still see the report.
export function reportCancelledEmail(to: string, report: ReportFacts, link: string | null): Email {
  return render(to, `Se canceló un reporte en ${report.campus}`, {
    paragraphs: ['Se canceló un reporte que registraste, que confirmaste como el mismo problema o que tenías asignado.'],
    details: reportDetails(report),
    link: link ? reportLink(link) : undefined,
  })
}

// RF-NOTIFICACION-04, 05
export function roleAssignedEmail(to: string, campus: string, role: StaffRole, appUrl: string): Email {
  const label = ROLE_LABELS[role]
  return render(to, `Ahora eres ${label} de ${campus} en Cima Fix`, {
    paragraphs: [
      `Se te asignó el rol de ${label} en el campus ${campus}.`,
      'Inicia sesión con tu cuenta @uabc.edu.mx para usarlo.',
    ],
    details: [
      ['Campus', campus],
      ['Rol', label],
    ],
    link: { url: appUrl, label: 'Abrir Cima Fix' },
  })
}

// RF-NOTIFICACION-16, 17, 19
export function thresholdReachedEmail(
  to: string,
  campus: string,
  status: OpenStatus,
  count: number,
  listUrl: string,
): Email {
  const label = STATUS_LABELS[status]
  const reportsText = count === 1 ? '1 reporte' : `${count} reportes`
  return render(to, `Alerta: ${reportsText} en estado ${label} en ${campus}`, {
    paragraphs: [`El campus ${campus} alcanzó el umbral de alerta: tiene ${reportsText} en estado ${label}.`],
    details: [
      ['Campus', campus],
      ['Estado', label],
      ['Reportes', String(count)],
    ],
    link: { url: listUrl, label: 'Ver los reportes' },
  })
}