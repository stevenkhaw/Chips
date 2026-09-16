/** Local-date helpers. Sessions store dates as 'YYYY-MM-DD' in local time. */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Local noon, so timezone shifts never move the calendar day inside a picker. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function formatDate(iso: string): string {
  return fromIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(iso: string): string {
  return fromIso(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
