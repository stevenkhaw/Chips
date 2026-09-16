export function formatCents(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = rem === 0 ? `${dollars}` : `${dollars}.${rem.toString().padStart(2, '0')}`;
  return `${sign}${symbol}${body}`;
}

export function formatSigned(cents: number, symbol = '$'): string {
  if (cents > 0) return `+${formatCents(cents, symbol)}`;
  return formatCents(cents, symbol);
}

const MONEY_RE = /^(\d*)(?:\.(\d{1,2}))?$/;

export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[\s$€£,]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const m = MONEY_RE.exec(cleaned);
  if (!m) return null;
  const dollars = m[1] === '' ? 0 : parseInt(m[1], 10);
  const centsStr = (m[2] ?? '').padEnd(2, '0');
  const cents = centsStr === '' ? 0 : parseInt(centsStr, 10);
  return dollars * 100 + cents;
}
