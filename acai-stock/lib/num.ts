/** Parse a pt-style decimal ("1,5") or dot decimal ("1.5"). Returns null if invalid/empty. */
export function parseQty(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** Format a number for display with pt comma decimals. */
export function fmtQty(n: number): string {
  return (Math.round(n * 100) / 100).toString().replace('.', ',');
}
