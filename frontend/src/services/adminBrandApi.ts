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
