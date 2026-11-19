// Single date/number formatting point for the SPA (SDD 13.1, DD-17).
const dateTime = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Tijuana',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

// "16 nov, 10:32", as shown in Figma.
export function formatDateTime(iso: string) {
  const parts = dateTime.formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const month = get('month').replace('.', '')
  return `${get('day')} ${month}, ${get('hour')}:${get('minute')}`
}

const integer = new Intl.NumberFormat('es-MX')

// "1,000"
export function formatNumber(value: number) {
  return integer.format(value)
}

// "1 confirmación" / "4 confirmaciones"
export function plural(count: number, one: string, many: string) {
  return `${formatNumber(count)} ${count === 1 ? one : many}`
}
