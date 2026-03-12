const CAMPAIGN_KEY = 'cb_campaign_id';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface StoredCampaign {
  campaignId: string;
  storedAt: string;
}

/**
 * Read campaign_id from URL and store in localStorage.
 * New values always overwrite (latest campaign wins).
 * Call once at app init alongside captureUTMFromURL().
 */
export function captureCampaignFromURL(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const campaignId = params.get('campaign_id') || params.get('cid');

    if (campaignId) {
      const stored: StoredCampaign = {
        campaignId,
        storedAt: new Date().toISOString(),
      };
      localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(stored));
    }
  } catch {
    // localStorage unavailable
  }
}

/**
 * Return stored campaign_id. Returns null if expired or missing.
 */
export function getCampaignId(): string | null {
  try {
    const raw = localStorage.getItem(CAMPAIGN_KEY);
    if (!raw) return null;

    const stored: StoredCampaign = JSON.parse(raw);
    const age = Date.now() - new Date(stored.storedAt).getTime();
    if (age > MAX_AGE_MS) {
      localStorage.removeItem(CAMPAIGN_KEY);
      return null;
    }

    return stored.campaignId || null;
  } catch {
    return null;
  }
}
