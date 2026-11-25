import { describe, expect, it } from 'vitest'

import {
  escapeHtml,
  formatDateTime,
  reportAssignedEmail,
  reportCancelledEmail,
  roleAssignedEmail,
  thresholdReachedEmail,
  type ReportFacts,
} from './templates.ts'

const report: ReportFacts = {
  campus: 'Campus Sauzal',
  building: 'Edificio <B>',
  space: 'Aula 3',
  category: 'Fuga de agua',
  // 18:00 UTC is 10:00 in Tijuana in November (UTC−8).
  createdAt: new Date('2026-11-24T18:00:00Z'),
}

describe('email templates', () => {
  it('RNF-USABILIDAD-04: shows the dates in America/Tijuana', () => {
    expect(formatDateTime(new Date('2026-11-24T18:00:00Z'))).toMatch(/24 de noviembre de 2026.*10:00/)
    // Summer time (UTC−7).
    expect(formatDateTime(new Date('2026-07-01T18:00:00Z'))).toMatch(/1 de julio de 2026.*11:00/)
  })

  it('RF-NOTIFICACION-06, 07: the report emails show campus, building, space, category and the link', () => {
    const email = reportAssignedEmail('a@uabc.edu.mx', report, 'https://cimafix.mx/reportes/r1')
    expect(email.to).toBe('a@uabc.edu.mx')
    for (const value of ['Campus Sauzal', 'Aula 3', 'Fuga de agua', 'https://cimafix.mx/reportes/r1']) {
      expect(email.text).toContain(value)
      expect(email.html).toContain(value)
    }
    expect(email.text).toContain('Edificio <B>')
  })

  it('escapes the names typed by admins in the HTML', () => {
    const email = reportAssignedEmail('a@uabc.edu.mx', report, 'https://cimafix.mx/reportes/r1')
    expect(email.html).toContain('Edificio &lt;B&gt;')
    expect(email.html).not.toContain('<B>')
    expect(escapeHtml(`"<'&>"`)).toBe('&quot;&lt;&#39;&amp;&gt;&quot;')
  })

  it('RF-NOTIFICACION-08: the cancellation email has no link when there is none to give', () => {
    const email = reportCancelledEmail('a@uabc.edu.mx', report, null)
    expect(email.text).not.toContain('Ver el reporte')
    expect(email.html).not.toContain('<a ')
  })

  it('RF-NOTIFICACION-05: the role email shows the campus and the role', () => {
    const staff = roleAssignedEmail('a@uabc.edu.mx', 'Campus Sauzal', 'staff', 'https://cimafix.mx')
    expect(staff.subject).toContain('Encargado')
    expect(staff.text).toContain('Campus Sauzal')
    expect(roleAssignedEmail('a@uabc.edu.mx', 'Campus Sauzal', 'admin', 'https://cimafix.mx').text).toContain('Admin')
  })

  it('RF-NOTIFICACION-19: the alert shows the campus, the status and the count', () => {
    const alert = thresholdReachedEmail('a@uabc.edu.mx', 'Campus Sauzal', 'in_review', 7, 'https://cimafix.mx/reportes')
    expect(alert.subject).toBe('Alerta: 7 reportes en estado En revisión en Campus Sauzal')
    expect(alert.text).toContain('Campus Sauzal')
    expect(alert.text).toContain('En revisión')
    expect(alert.text).toContain('7')
    expect(thresholdReachedEmail('a@uabc.edu.mx', 'C', 'new', 1, 'u').subject).toBe('Alerta: 1 reporte en estado Nuevo en C')
  })
})