import axios from 'axios';
import { getSignupAcquisitionFields } from './utmService';

/**
 * The public Open House pair (OH-3): read the next event, sign somebody up for it.
 *
 * ── WHY ITS OWN AXIOS INSTANCE, NOT `utils/api` ──────────────────────────────
 *
 * `utils/api` is the admin/public shared client, and it does two things this page
 * does not want:
 *
 *  1. Its request interceptor attaches `admin_token` when one is in localStorage.
 *     Both routes here are unauthenticated, so the header grants nothing — but it
 *     means a staff member checking the live funnel sends their admin JWT to a
 *     public endpoint on every page view, for no purpose.
 *  2. Its response interceptor raises a global toast on every 4xx and 5xx. This
 *     page shows the server's message inline, next to the form, so the shared
 *     client would report every failure twice — once where the person is looking
 *     and once in a corner.
 *
 * Same `baseURL` convention, so it is pointed at the same place in every
 * environment.
 */
const publicApi = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '',
  headers: { 'Content-Type': 'application/json' },
  // Long enough for a cold CCPP read behind the event endpoint, short enough that
  // a hung upstream does not leave somebody staring at a spinner.
  timeout: 15000,
});

/** GET /api/v1/open-house/event, as the backend composes it. */
export interface NextOpenHouse {
  event_id: string;
  name: string;
  /** ISO instant. Correct in Central since OH-1; this page never does the conversion itself. */
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  /** Finished strings. Rendered as given — the backend owns the timezone, not this page. */
  date_label: string;
  time_label: string;
  format_label: string;
  price_label: string;
  is_online: boolean;
  capacity: number | null;
  registered: number | null;
  seats_remaining: number | null;
  rsvp_url: string | null;
}

/** The subset the signup response echoes back, to confirm WHICH event they joined. */
export interface SignedUpEvent {
  event_id: string;
  date_label: string;
  time_label: string;
  format_label: string;
  seats_remaining: number | null;
}

export interface OpenHouseSignupResult {
  ok: true;
  /** false when the email already had an account; the seat is still taken. */
  created: boolean;
  /** false when no event was announced, or the attendee write failed. The account exists either way. */
  registered: boolean;
  event: SignedUpEvent | null;
  message: string;
  /**
   * C121: present only when this sign-up CREATED the account: a portal session and where to open it (the welcome
   * video). Null or absent for an address that already had an account, which must sign in instead. The form is public,
   * so the server never signs a visitor into an account that existed before.
   */
  access?: { jwt: string; next: string } | null;
}

/**
 * The next announced Open House, or null.
 *
 * NEVER THROWS, and null is a first-class answer rather than an error: "we do not
 * know when the next one is" is a state this page renders honestly. The one thing
 * it must not do is invent a date, so a failure here resolves to null and the page
 * drops the date line instead of guessing.
 */
export async function fetchNextOpenHouse(): Promise<NextOpenHouse | null> {
  try {
    const { data } = await publicApi.get<{ announced?: boolean } & NextOpenHouse>(
      '/api/v1/open-house/event',
    );
    if (!data || data.announced !== true) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * What the public signup route accepts. Mirrors `openHousePublicSignupSchema`,
 * which is `.strict()` — an extra key is a 400 for the whole signup, not an
 * ignored field.
 */
export interface OpenHouseSignupBody {
  name: string;
  email: string;
  /** Absent or false records NO consent. It is not a revocation and not a default to flip on. */
  marketing_opt_in?: boolean;
  utm_source?: string;
  utm_campaign?: string;
  page_url?: string;
}

/**
 * The three acquisition keys this route accepts, and only those three.
 *
 * `getSignupAcquisitionFields()` also returns `utm_content` and `utm_term`,
 * because `/api/portal/free-signup` takes them. This route does not, and its
 * schema is `.strict()`, so passing that object through wholesale would 400 every
 * signup arriving from an ad — the exact failure the free-signup page's own
 * retry-without-tracking fallback was written for. Picked explicitly instead, so
 * the mismatch is a visible decision rather than a runtime surprise.
 */
export function openHouseAcquisitionFields(): Pick<OpenHouseSignupBody, 'utm_source' | 'utm_campaign' | 'page_url'> {
  const all = getSignupAcquisitionFields();
  const out: Pick<OpenHouseSignupBody, 'utm_source' | 'utm_campaign' | 'page_url'> = {};
  if (all.utm_source) out.utm_source = all.utm_source;
  if (all.utm_campaign) out.utm_campaign = all.utm_campaign;
  if (all.page_url) out.page_url = all.page_url;
  return out;
}

/** POST /api/v1/open-house/signup — the seat, the $0 account and the welcome email, in one call. */
export async function signUpForOpenHouse(body: OpenHouseSignupBody): Promise<OpenHouseSignupResult> {
  const { data } = await publicApi.post<OpenHouseSignupResult>('/api/v1/open-house/signup', body);
  return data;
}
