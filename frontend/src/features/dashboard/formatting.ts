export function formatDate(value: string) {
  const time = new Date(value);
  return Number.isNaN(time.valueOf()) ? '—' :
    new Intl.DateTimeFormat('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(time) + ' UTC';
}
export function formatShortTime(value: string) {
  const time = new Date(value);
  return new Intl.DateTimeFormat('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(time);
}
export function formatValue(value: number) {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(value);
}
