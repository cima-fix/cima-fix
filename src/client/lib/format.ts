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

const longDate = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Tijuana',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h23',
})

// "23 nov 2026, 3:42 p. m.", as in the desktop detail frame.
export function formatLongDateTime(iso: string) {
  const parts = longDate.formatToParts(new Date(iso))
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  const hour = Number(get('hour'))
  const period = hour < 12 ? 'a. m.' : 'p. m.'
  const month = get('month').replace('.', '')
  return `${get('day')} ${month} ${get('year')}, ${hour % 12 || 12}:${get('minute')} ${period}`
}

// "Hace 5 h", "Hace 2 días": age of a report on the desktop list and home.
export function formatAge(iso: string, now = Date.now()) {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000))
  if (minutes < 60) return `Hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Hace ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Hace 1 día' : `Hace ${formatNumber(days)} días`
}
