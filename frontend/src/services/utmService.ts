const UTM_KEY = 'cb_utm_params';
const UTM_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredUTM {
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
  storedAt: string;
}

export interface UTMParams {
  utmSource: string;
  utmCampaign: string;
  utmMedium: string;
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

    if (source || campaign || medium) {
      const stored: StoredUTM = {
        utmSource: source || '',
        utmCampaign: campaign || '',
        utmMedium: medium || '',
        storedAt: new Date().toISOString(),
      };
      localStorage.setItem(UTM_KEY, JSON.stringify(stored));
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
    if (!raw) return { utmSource: '', utmCampaign: '', utmMedium: '' };

    const stored: StoredUTM = JSON.parse(raw);
    const age = Date.now() - new Date(stored.storedAt).getTime();
    if (age > UTM_MAX_AGE_MS) {
      localStorage.removeItem(UTM_KEY);
      return { utmSource: '', utmCampaign: '', utmMedium: '' };
    }

    return {
      utmSource: stored.utmSource || '',
      utmCampaign: stored.utmCampaign || '',
      utmMedium: stored.utmMedium || '',
    };
  } catch {
    return { utmSource: '', utmCampaign: '', utmMedium: '' };
  }
}

/**
 * Return backend-compatible UTM fields for form payloads.
 * Matches the toLeadPayload pattern: utm_medium is piped into utm_source.
 */
export function getUTMPayloadFields(): {
  utm_source?: string;
  utm_campaign?: string;
  page_url: string;
} {
  const { utmSource, utmCampaign, utmMedium } = getUTMParams();

  const source = utmMedium
    ? `${utmSource || 'direct'}|${utmMedium}`
    : utmSource || undefined;

  return {
    utm_source: source,
    utm_campaign: utmCampaign || undefined,
    page_url: window.location.href,
  };
}
