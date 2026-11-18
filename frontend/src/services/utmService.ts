const UTM_KEY = 'cb_utm_params';
const UTM_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredUTM {
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  /** C94: which ad / which placement. Optional because entries stored before C94 lack them. */
  utmContent?: string;
  utmTerm?: string;
  storedAt: string;
}

export interface UTMParams {
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  utmContent?: string;
  utmTerm?: string;
  lid?: string;
}

/**
 * Read URL search params and store UTM values in localStorage.
 * New URL params always overwrite stored values (latest campaign wins).
 * Call once at app init (e.g. alongside initTracker).
 */
export function captureUTMFromURL(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const source = params.get('utm_source');
    const campaign = params.get('utm_campaign');
    const medium = params.get('utm_medium');
    const content = params.get('utm_content');
    const term = params.get('utm_term');

    const lid = params.get('lid');

    if (source || campaign || medium || content || term || lid) {
      const stored: StoredUTM = {
        utmSource: source || '',
        utmCampaign: campaign || '',
        utmMedium: medium || '',
        utmContent: content || '',
        utmTerm: term || '',
        storedAt: new Date().toISOString(),
      };
      localStorage.setItem(UTM_KEY, JSON.stringify(stored));
      if (lid) localStorage.setItem('cb_lid', lid);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
}

/**
 * Return stored UTM params. Returns empty strings if expired or missing.
 */
export function getUTMParams(): UTMParams {
  try {
    const raw = localStorage.getItem(UTM_KEY);
    if (!raw) return { utmSource: '', utmCampaign: '', utmMedium: '', lid: localStorage.getItem('cb_lid') || '' };

    const stored: StoredUTM = JSON.parse(raw);
    const age = Date.now() - new Date(stored.storedAt).getTime();
    if (age > UTM_MAX_AGE_MS) {
      localStorage.removeItem(UTM_KEY);
      return { utmSource: '', utmCampaign: '', utmMedium: '', lid: localStorage.getItem('cb_lid') || '' };
    }

    return {
      utmSource: stored.utmSource || '',
      utmCampaign: stored.utmCampaign || '',
      utmMedium: stored.utmMedium || '',
      utmContent: stored.utmContent || '',
      utmTerm: stored.utmTerm || '',
      lid: localStorage.getItem('cb_lid') || '',
    };
  } catch {
    return { utmSource: '', utmCampaign: '', utmMedium: '' };
  }
}

/**
 * Build the advisor.colaberry.ai URL preserving UTM params from current page.
 */
export function getAdvisoryUrl(path: string = '/advisory/'): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .filter(k => params.get(k))
      .map(k => `${k}=${encodeURIComponent(params.get(k) || '')}`)
      .join('&');
    return `https://advisor.colaberry.ai${path}${utm ? '?' + utm : ''}`;
  } catch {
    return `https://advisor.colaberry.ai${path}`;
  }
}

/**
 * Build a demo walkthrough URL for a specific industry scenario.
 * Includes UTM passthrough + lid for identity resolution.
 */
export function getDemoWalkthroughUrl(scenario: string): string {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
      .filter(k => params.get(k))
      .map(k => `${k}=${encodeURIComponent(params.get(k) || '')}`)
      .join('&');
    const lid = localStorage.getItem('cb_lead_id') || localStorage.getItem('cb_lid') || '';
    const lidParam = lid ? `lid=${lid}` : '';
    const extra = [utm, lidParam].filter(Boolean).join('&');
    return `https://advisor.colaberry.ai/advisory/demo/walkthrough?scenario=${scenario}${extra ? '&' + extra : ''}`;
  } catch {
    return `https://advisor.colaberry.ai/advisory/demo/walkthrough?scenario=${scenario}`;
  }
}

/**
 * The UTM fields a lead form posts. `utm_medium` travels as ITSELF.
 *
 * ── R22: THE `source|medium` CONVENTION ENDS HERE ─────────────────────────────────────
 *
 * This used to return `utm_source: 'fb|paid'` — the source and the medium concatenated into one
 * string — because `leads` had no `utm_medium` column and that was the only way the medium
 * survived the trip. C10.4 added the column (`db/ensureLeadAttributionColumns.ts`) precisely so
 * that "NEW rows can carry a medium as a value rather than as half of a string", and R22 is the
 * write side it was added for.
 *
 * WHAT THE PIPE COST, measured on production 2026-11-18: 135 leads carry a packed `utm_source`,
 * and because `fb` and `fb|paid` are different group keys, one Facebook channel reports as two
 * lines — 385 Facebook leads split into 315 + 70, and 196 Instagram into 132 + 64. The packed
 * shape also misses `PLACEMENT_FOR_SOURCE`, so its spend resolves to null and its
 * cost-per-signup renders blank, which reads as missing data rather than as a bug. 129 of those
 * 135 rows ALSO carry the correct `utm_medium` alongside, so the pipe was not even preserving
 * anything the row did not already hold.
 *
 * `adSpend/utmSource.ts` keeps splitting the packed shape on read, and must: it is what makes the
 * rows already stored legible. It is no longer compensating for what this function emits.
 *
 * Every receiving route accepts the separate key: `/api/leads` (v1LeadSchema already declared
 * `utm_medium`), `/api/create-free-account`, `/api/calendar/book` and `/api/sponsor/redeem`. None
 * of the four is `.strict()`, so no body shape is being widened past what the server will take.
 */
export function getUTMPayloadFields(): {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  page_url: string;
} {
  const { utmSource, utmCampaign, utmMedium } = getUTMParams();

  return {
    utm_source: utmSource || undefined,
    utm_medium: utmMedium || undefined,
    utm_campaign: utmCampaign || undefined,
    page_url: window.location.href,
  };
}

/** The UTM tags on the current URL, or null when it carries none. */
function utmFromCurrentUrl(): UTMParams | null {
  try {
    const p = new URLSearchParams(window.location.search);
    const get = (k: string) => p.get(k) || '';
    const tags = {
      utmSource: get('utm_source'), utmMedium: get('utm_medium'), utmCampaign: get('utm_campaign'),
      utmContent: get('utm_content'), utmTerm: get('utm_term'),
    };
    return Object.values(tags).some(Boolean) ? tags : null;
  } catch {
    return null;
  }
}

export interface SignupAcquisitionFields {
  utm_source?: string;
  /** R22: its own key, not the half of `utm_source` after a pipe. */
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  page_url?: string;
}

/** The server caps (enrollmentSchema portalFreeSignupSchema): 255 per UTM field, 500 and http(s) for page_url. */
const UTM_MAX = 255;
const PAGE_URL_MAX = 500;

/**
 * C94: the acquisition keys for POST /api/portal/free-signup, which the signup page never sent, so every ad signup
 * was recorded as a plain `free_signup` with no source. Carries utm_content (which ad) and utm_term (which
 * placement) as well.
 *
 * R22: `utm_medium` is sent as its OWN key here too, not packed into `utm_source` as `fb|paid`. This is the
 * function that produced every packed row on production — 134 of the 135, all since 2026-11-03, which is when
 * C104 started reading the ad URL on the signup page. The server side of that key had to ship in the same
 * change: this route is `.strict()`, so `utm_medium` 400s the signup until `portalFreeSignupSchema` declares it.
 *
 * The route is `.strict()` and validates each value, so this returns ONLY keys that hold a value the server will
 * accept: an empty value is omitted (absent means "not known"), an over-long value is omitted rather than truncated
 * (a cut-off id is a wrong id), and page_url is sent only when it is http(s) and within 500 characters. A signup must
 * never fail because of a tracking value.
 *
 * C104: the tags are read from THIS page's URL first, storage second. Only the public layouts call captureUTMFromURL,
 * and the ad lands on a builder page outside the app, so on /portal/signup the storage is normally empty: measured
 * 0 of 53 ad signups storing utm_content while 443 of 446 ad URLs carried it. A URL with any UTM tag is taken whole
 * (one ad click's tags, never mixed with an older visit's); a bare URL falls back to what storage holds.
 */
export function getSignupAcquisitionFields(): SignupAcquisitionFields {
  const fromUrl = utmFromCurrentUrl();
  const stored = getUTMParams();
  const { utmSource, utmMedium, utmCampaign, utmContent, utmTerm } = fromUrl ?? stored;
  const out: SignupAcquisitionFields = {};
  const put = (key: Exclude<keyof SignupAcquisitionFields, 'page_url'>, v: string | undefined) => {
    const s = (v || '').trim();
    if (s && s.length <= UTM_MAX) out[key] = s;
  };
  put('utm_source', utmSource);
  put('utm_medium', utmMedium);
  put('utm_campaign', utmCampaign);
  put('utm_content', utmContent);
  put('utm_term', utmTerm);
  try {
    const href = window.location.href;
    if (/^https?:\/\//i.test(href) && href.length <= PAGE_URL_MAX) out.page_url = href;
  } catch { /* no location: leave page_url out */ }
  return out;
}
