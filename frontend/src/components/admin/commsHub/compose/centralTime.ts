/**
 * Central time for the Compose "At a set time" control (CH6.5). The organizer picks a Central date and
 * time whatever zone their browser is in; these convert both ways without the browser's own zone.
 */
const TZ = 'America/Chicago';
const partsFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

function offsetMinutes(atMs: number): number {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(atMs)).map((x) => [x.type, Number(x.value)]));
  return Math.round((atMs - Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)) / 60_000);
}

/** "2026-12-01" + "18:00" (Central) -> the ISO instant. Two passes, so the offset is the one at the target. */
export function centralToIso(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const naive = Date.parse(`${date}T${time}:00Z`);
  if (Number.isNaN(naive)) return null;
  let guess = naive + offsetMinutes(naive) * 60_000;
  guess = naive + offsetMinutes(guess) * 60_000;
  return new Date(guess).toISOString();
}

/** An ISO instant -> { date, time } on the Central clock, for the inputs. */
export function isoToCentral(iso: string): { date: string; time: string } {
  const p = Object.fromEntries(partsFmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const labelFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
/** "Mon, Nov 30, 6:00 PM CST". */
export function centralLabel(iso: string): string {
  return labelFmt.format(new Date(iso));
}
