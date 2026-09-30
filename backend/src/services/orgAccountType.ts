/**
 * Business account types, and how the entry site decides which one.
 *
 * Three accounts, distinguished by what the person came to us for:
 *
 *   Training     an individual learner. Creates NO organization at all — it is
 *                the plain free-signup path and never reaches this file.
 *   Business     `enterprise_customer`. Business leaders monitoring their team's
 *                training and builds. Gets the free training account too: a
 *                manager who cannot see the curriculum cannot evaluate it.
 *   Consulting   `client`. They want us to build something. They get an
 *                organization and a lead, and NO training enrollment.
 *
 * Only two of the three are ORGANIZATION types, because a training account is
 * an enrollment with no company attached. Inventing an org type for it would
 * create rows representing companies that do not exist.
 *
 * WHY `client` RATHER THAN A NEW `consulting` VALUE. `organization_type:
 * 'client'` already exists — `services/delivery/leadConversion.ts` creates
 * exactly this when a lead converts to delivery work: an organization, a linked
 * lead, and a delivery engagement. That is the same account this adds a
 * self-serve entrance to. A second near-identical type is how a taxonomy rots:
 * two values that mean the same thing drift apart, and every query afterwards
 * has to remember both.
 *
 * THE DEFAULT IS THE OLD BEHAVIOUR. An unrecognised or missing entry site
 * yields `management_account`, which is what every existing row was backfilled
 * to and what registration has always produced. A new brand landing page that
 * nobody mapped therefore behaves exactly as it does today rather than silently
 * creating accounts of a new kind.
 */

/**
 * THE DEFAULT IS `enterprise_customer`, VERIFIED AGAINST PRODUCTION.
 *
 * `ensureRefactoredDeliverySchema` contains a backfill to `management_account`,
 * and it is misleading: it runs `WHERE organization_type IS NULL`, and no row
 * was ever null, so it has never applied. All six production organizations are
 * `enterprise_customer`, and the vocabulary the Organization model documents is
 * `enterprise_customer | community_partner | church | nonprofit_partner |
 * client | internal | sponsor`.
 *
 * Defaulting to `management_account` would therefore have created a seventh
 * value that no existing row uses and no query looks for — the taxonomy split
 * this file is supposed to prevent, introduced by the file preventing it.
 */
export const ORG_ACCOUNT_TYPES = ['enterprise_customer', 'client'] as const;

export type OrgAccountType = (typeof ORG_ACCOUNT_TYPES)[number];

export const DEFAULT_ACCOUNT_TYPE: OrgAccountType = 'enterprise_customer';

export function isOrgAccountType(v: string): v is OrgAccountType {
  return (ORG_ACCOUNT_TYPES as readonly string[]).includes(v);
}

/**
 * Entry site → account type.
 *
 * Keys are a lowercased hostname, OPTIONALLY followed by a path prefix.
 * Longest key wins, so `a.com/consulting` beats a bare `a.com`.
 *
 * THE PATH FORM EXISTS BECAUSE ONE DOMAIN WILL SOON MEAN TWO THINGS. Colaberry
 * Enterprise is the Business and Training entrance today and will later offer
 * consulting as well. A hostname-only table cannot express that: the domain
 * would have to be either Business or Consulting for everyone. Adding
 * `enterprise.colaberry.ai/consulting` here, when that page exists, is then a
 * one-line change rather than a redesign.
 *
 * `aiflotation.com` is the reason this file exists: those registrations were
 * creating free training accounts for people who had come to have something
 * built for them. It replaced `dataflotation.com`, which is deliberately NOT
 * listed — the old domain should not quietly keep minting accounts.
 */
export const ENTRY_SITE_ACCOUNT_TYPES: Readonly<Record<string, OrgAccountType>> = {
  'aiflotation.com': 'client',
  'www.aiflotation.com': 'client',
};

/**
 * Normalise anything a caller might send as an "entry site" down to a hostname.
 *
 * Accepts a bare hostname, a full URL, or a URL with a path, because the front
 * end may send `document.referrer`, `window.location.hostname`, or a configured
 * constant, and which of those arrives should not change the account a person
 * gets.
 */
export function normalizeEntrySite(raw: string | null | undefined): string {
  const value = (raw ?? '').trim().toLowerCase();
  if (!value) return '';

  const withoutScheme = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  const withoutQuery = withoutScheme.split('?')[0].split('#')[0];

  const slash = withoutQuery.indexOf('/');
  const hostPart = slash === -1 ? withoutQuery : withoutQuery.slice(0, slash);
  const pathPart = slash === -1 ? '' : withoutQuery.slice(slash);

  // Port stripped, but www. is NOT: the table lists both forms explicitly, so a
  // silent rewrite here cannot mask a missing entry.
  const host = hostPart.split(':')[0];

  // The PATH IS KEPT, because one domain will soon mean two things. Trailing
  // slashes are dropped so `/consulting` and `/consulting/` are one key.
  const path = pathPart.replace(/\/+$/, '');
  return path ? `${host}${path}` : host;
}

/**
 * Look up an entry site, most specific first.
 *
 * `enterprise.colaberry.ai/consulting/start` tries that, then
 * `/consulting`, then the bare host. Longest match wins, so a general domain
 * mapping never shadows a specific page.
 */
export function lookupEntrySite(
  normalized: string,
  // Injectable ONLY so a test can exercise this function against a table that
  // contains the one-domain-two-meanings case before that page exists. Without
  // it a test has to restate the matching rule against a stand-in table, which
  // proves the test's own reimplementation works and nothing about this code.
  table: Readonly<Record<string, OrgAccountType>> = ENTRY_SITE_ACCOUNT_TYPES,
): OrgAccountType | undefined {
  if (!normalized) return undefined;

  const slash = normalized.indexOf('/');
  const host = slash === -1 ? normalized : normalized.slice(0, slash);
  const segments = slash === -1 ? [] : normalized.slice(slash + 1).split('/').filter(Boolean);

  for (let depth = segments.length; depth > 0; depth--) {
    const key = `${host}/${segments.slice(0, depth).join('/')}`;
    const hit = table[key];
    if (hit) return hit;
  }
  return table[host];
}

export interface AccountTypeResolution {
  accountType: OrgAccountType;
  /** True when the entry site actually matched the table. */
  matched: boolean;
  /** The normalised host we looked up, for logging. */
  host: string;
}

/**
 * Resolve the account type for a registration.
 *
 * An explicit `accountType` wins when supplied and valid — an internal caller
 * creating a consulting account directly should not have to fake a referrer.
 * Otherwise the entry site decides, and an unknown site takes the default.
 */
export function resolveAccountType(input: {
  accountType?: string | null;
  entrySite?: string | null;
}): AccountTypeResolution {
  const explicit = (input.accountType ?? '').trim();
  if (explicit && isOrgAccountType(explicit)) {
    return { accountType: explicit, matched: true, host: '' };
  }

  const host = normalizeEntrySite(input.entrySite);
  const mapped = lookupEntrySite(host);
  if (mapped) return { accountType: mapped, matched: true, host };

  return { accountType: DEFAULT_ACCOUNT_TYPE, matched: false, host };
}

/**
 * Does this account type come with a free training enrollment?
 *
 * Consulting accounts do not. They came to have something built, and enrolling
 * them as students put them on learner rosters, in learner counts, and in the
 * nurture the Explorer engine is built to run — none of which describes a
 * consulting client.
 */
export function grantsTrainingEnrollment(type: OrgAccountType): boolean {
  return type !== 'client';
}

/** Display label for the admin surface. `client` reads as Consulting to a human. */
export function accountTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case 'client':
      return 'Consulting';
    case 'enterprise_customer':
      return 'Business';
    default:
      // Every other documented value (community_partner, church,
      // nonprofit_partner, internal, sponsor) and any legacy null are business
      // accounts as far as this surface is concerned.
      return 'Business';
  }
}
