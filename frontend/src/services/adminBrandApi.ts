import api from '../utils/api';

/**
 * adminBrandApi — the client for the brand administration endpoints.
 *
 * Types mirror the backend field for field rather than being loosened for convenience. The
 * marketing dashboard learned that lesson expensively: its `roi` state was `useState<any>`, so
 * when the backend changed a field to `number | null` nothing objected, and the page rendered a
 * confident `$0` for a value the system had just been taught it could not know. `any` at a
 * boundary does not skip one check, it disables the mechanism that catches a producer changing
 * under its consumer.
 */

export type DnsCheckStatus = 'unknown' | 'pass' | 'fail';
export type DomainVerificationStatus = 'pending' | 'verified' | 'failed';
export type BrandStatus = 'active' | 'inactive';

export interface Brand {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  status: BrandStatus;
  default_public_url: string | null;
  support_email: string | null;
  /** Meta Pixel ID, or null when this brand is not being advertised. Digits only. */
  meta_pixel_id: string | null;
}

export interface BrandDomain {
  id: string;
  hostname: string;
  purpose: 'web' | 'app' | 'email' | 'tracking' | 'reply';
  is_primary: boolean;
  provider: string | null;
  verification_status: DomainVerificationStatus;
  /** NOT booleans. `unknown` means the check has not run — it is not a failure. */
  spf_status: DnsCheckStatus;
  dkim_status: DnsCheckStatus;
  dmarc_status: DnsCheckStatus;
  verified_at: string | null;
  last_checked_at: string | null;
}

export interface SenderPreflight {
  ok: boolean;
  /** Machine-readable reasons, one per FAILED check — not a single first-failure. */
  failures: string[];
  checks: {
    profileActive: boolean;
    domainVerified: boolean;
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
    unsubscribeUrl: boolean;
    physicalAddress: boolean;
  };
}

export interface SenderProfileWithPreflight {
  profile: { id: string; name: string; from_email: string; from_name: string | null };
  preflight: SenderPreflight;
}

export interface BrandSendReadiness {
  brand: Brand | null;
  domains: BrandDomain[];
  profiles: SenderProfileWithPreflight[];
}

/** Scope mode the server applied, surfaced so the page can say WHY a list is empty. */
export type ScopeMode = 'scoped' | 'migration_open' | 'denied';

export async function listBrands(params?: { status?: BrandStatus; q?: string }): Promise<{
  brands: Brand[];
  scope_mode: ScopeMode;
}> {
  const res = await api.get('/api/admin/brands', { params });
  return { brands: res.data.brands ?? [], scope_mode: res.data.scope_mode };
}

export async function getBrandSendReadiness(brandId: string): Promise<BrandSendReadiness> {
  const res = await api.get(`/api/admin/brands/${brandId}/send-readiness`);
  return res.data.readiness;
}

/**
 * Set or clear a brand's Meta Pixel ID.
 *
 * This is the whole "process where the user just passes the id" - one field, saved once per
 * brand, after which every hosted landing page that brand owns carries the tracking. Passing
 * null clears it, which is how an operator turns tracking back off.
 *
 * The backend validates the digits again, and so does the renderer. Three checks for one value
 * looks like belt and braces until you remember where it ends up: inside a <script> tag on a
 * public page.
 */
export async function setBrandMetaPixelId(
  brandId: string,
  metaPixelId: string | null,
): Promise<Brand> {
  const res = await api.patch(`/api/admin/brands/${brandId}`, { meta_pixel_id: metaPixelId });
  return res.data.brand as Brand;
}
