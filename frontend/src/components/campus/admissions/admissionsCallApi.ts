import portalApi from '../../../utils/portalApi';

/**
 * The campus "Book a call with admissions" API (C20; backend routes/campusAdmissionsCallRoutes.ts). Times are ISO instants; the
 * sheet shows them in Central, the calendar's zone. The opener bus lives here too: any entry point (the help desk chip, Where to?,
 * the Admissions meeting table, Coming up's Reschedule) calls openBookCall(); the one host shows the sheet.
 */
export const ADMISSIONS_TOPICS = ['enroll', 'payment', 'cohort', 'other'] as const;
export type AdmissionsTopic = typeof ADMISSIONS_TOPICS[number];
export const TOPIC_LABEL: Record<AdmissionsTopic, string> = {
  enroll: 'Enrollment & next steps', payment: 'Payment or employer sponsorship', cohort: 'Changing my cohort', other: 'Something else',
};
export const NOTE_MAX = 500;
export const CALL_TZ = 'America/Chicago';

export interface Slot { start: string; end: string }
export interface SlotDay { date: string; slots: Slot[] }
export interface AdmissionsBooking { eventId: string; startTime: string; endTime: string; meetLink: string; topic: AdmissionsTopic | null }

export type BookOutcome =
  | { kind: 'booked'; booking: AdmissionsBooking }
  | { kind: 'already'; booking: AdmissionsBooking | null }
  | { kind: 'taken' }
  | { kind: 'unavailable' };

const BASE = '/api/portal/campus/admissions-call';

export async function getSlots(): Promise<{ timezone: string; dates: SlotDay[] }> {
  return (await portalApi.get(`${BASE}/slots`)).data;
}

export async function getUpcoming(): Promise<AdmissionsBooking | null> {
  return ((await portalApi.get(BASE)).data?.booking ?? null) as AdmissionsBooking | null;
}

/** Book; every outcome the sheet must draw is a value, not a throw (only a network-level surprise throws). */
export async function bookCall(body: { slotStart: string; topic: AdmissionsTopic; note?: string }): Promise<BookOutcome> {
  try {
    const { data } = await portalApi.post(BASE, body);
    return { kind: 'booked', booking: data.booking };
  } catch (e: unknown) {
    const r = (e as { response?: { status?: number; data?: { error_class?: string; booking?: AdmissionsBooking | null } } }).response;
    if (r?.status === 409 && r.data?.error_class === 'AlreadyBooked') return { kind: 'already', booking: r.data.booking ?? null };
    if (r?.status === 409) return { kind: 'taken' };
    return { kind: 'unavailable' };
  }
}

export async function cancelCall(eventId: string): Promise<void> {
  await portalApi.delete(`${BASE}/${encodeURIComponent(eventId)}`);
}

/** Wall-clock pieces in Central: "Tue, Oct 27" and "10:00 AM", and the zone's short name ("CDT"). */
export function centralParts(iso: string): { day: string; time: string; zone: string } {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: CALL_TZ, weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { timeZone: CALL_TZ, hour: 'numeric', minute: '2-digit' });
  const zone = new Intl.DateTimeFormat('en-US', { timeZone: CALL_TZ, timeZoneName: 'short' }).formatToParts(d).find((p) => p.type === 'timeZoneName')?.value || 'CT';
  return { day, time, zone };
}

/** A day tile's three lines in Central: "Tue" / "27" / "Oct". */
export function dayTile(iso: string): { wd: string; d: string; m: string } {
  const d = new Date(iso);
  const f = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-US', { timeZone: CALL_TZ, ...o });
  return { wd: f({ weekday: 'short' }), d: f({ day: 'numeric' }), m: f({ month: 'short' }) };
}

export const BOOK_CALL_EVENT = 'cm-book-call';
export const BOOKING_CHANGED_EVENT = 'cm-booking-changed';

/** Open the sheet; with a booking it opens on that call (Keep it / Reschedule) instead of the picker. */
export function openBookCall(current: AdmissionsBooking | null = null): void {
  try { window.dispatchEvent(new CustomEvent<AdmissionsBooking | null>(BOOK_CALL_EVENT, { detail: current })); } catch { /* non-DOM environment */ }
}
export function onBookCall(cb: (current: AdmissionsBooking | null) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<AdmissionsBooking | null>).detail ?? null);
  window.addEventListener(BOOK_CALL_EVENT, h);
  return () => window.removeEventListener(BOOK_CALL_EVENT, h);
}
export function bookingChanged(): void {
  try { window.dispatchEvent(new CustomEvent(BOOKING_CHANGED_EVENT)); } catch { /* non-DOM environment */ }
}
export function onWindowEvent(name: string, cb: () => void): () => void {
  window.addEventListener(name, cb);
  return () => window.removeEventListener(name, cb);
}
