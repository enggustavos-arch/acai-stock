// All business dates use the shops' timezone (Portugal).
export const TZ = 'Europe/Lisbon';

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** YYYY-MM-DD for a Date, in Europe/Lisbon */
export function isoDate(d: Date): string {
  return fmt.format(d);
}

/** Today in Europe/Lisbon as YYYY-MM-DD */
export function todayLisbon(): string {
  return isoDate(new Date());
}

/** YYYY-MM-DD n days before the given iso date */
export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00Z'); // noon UTC avoids DST edge issues
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Current time HH:MM in Europe/Lisbon */
export function nowTimeLisbon(): string {
  return new Intl.DateTimeFormat('pt-PT', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

/** Display DD/MM/YYYY */
export function displayDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
