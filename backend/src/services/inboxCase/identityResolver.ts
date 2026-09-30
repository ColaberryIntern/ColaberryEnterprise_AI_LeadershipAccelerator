import InboxIdentityAlias from '../../models/InboxIdentityAlias';
import { AliasType } from '../../types/inboxCase';
import { normalizeEmailAddress, normalizeQuery } from './textNormalization';

// Reusable, persisted person-identity resolution. Nothing about any specific
// person (e.g. "Kes") is hardcoded here — every alias is a row in
// inbox_identity_aliases, discovered once and reused on every future case,
// per root directive section 5.

export interface ResolvedIdentity {
  canonicalName: string;
  emails: string[];
  displayNames: string[];
  companyDomains: string[];
  basecampPersonIds: string[];
  isNewCanonical: boolean;
}

// Resolves a free-text person query ("Kes", "kes@colaberry.com") to every
// known alias sharing its canonical identity. If the query itself matches no
// existing alias, it seeds a brand-new canonical identity (unverified,
// confidence 60) from the query text alone — later discovery/grouping steps
// can raise confidence or add aliases via upsertAlias() as they find
// co-occurring identifiers (e.g. an email address that appears in the same
// thread as an already-confirmed alias).
export async function resolveIdentity(query: string): Promise<ResolvedIdentity> {
  const trimmed = query.trim();
  const asEmail = normalizeEmailAddress(trimmed);
  const looksLikeEmail = asEmail.includes('@');

  const directMatch = await InboxIdentityAlias.findOne({
    where: looksLikeEmail
      ? { alias_type: 'email', alias_value: asEmail }
      : { alias_type: 'display_name', alias_value: normalizeQuery(trimmed) },
  });

  const canonicalName = directMatch ? directMatch.canonical_name : trimmed;

  const allAliases = await InboxIdentityAlias.findAll({ where: { canonical_name: canonicalName } });

  const resolved: ResolvedIdentity = {
    canonicalName,
    emails: [],
    displayNames: [],
    companyDomains: [],
    basecampPersonIds: [],
    isNewCanonical: allAliases.length === 0,
  };

  for (const a of allAliases) {
    switch (a.alias_type) {
      case 'email':
        resolved.emails.push(a.alias_value);
        break;
      case 'display_name':
      case 'name_variation':
        resolved.displayNames.push(a.alias_value);
        break;
      case 'company_domain':
        resolved.companyDomains.push(a.alias_value);
        break;
      case 'basecamp_person_id':
        resolved.basecampPersonIds.push(a.alias_value);
        break;
    }
  }

  // Seed the query itself as a known alias so the very first case for a new
  // person still has something to match against.
  if (looksLikeEmail && !resolved.emails.includes(asEmail)) {
    resolved.emails.push(asEmail);
  } else if (!looksLikeEmail && !resolved.displayNames.includes(normalizeQuery(trimmed))) {
    resolved.displayNames.push(normalizeQuery(trimmed));
  }

  return resolved;
}

export interface UpsertAliasInput {
  canonicalName: string;
  aliasType: AliasType;
  aliasValue: string;
  provider?: string | null;
  externalPersonId?: string | null;
  confidence?: number;
  verifiedBy?: string | null;
}

// Idempotent create-or-touch. A given (alias_type, alias_value) maps to
// exactly one canonical identity (unique index) — re-upserting the same
// alias under a different canonical_name is a no-op that keeps the
// original owner, since silently reassigning an identity is a correctness
// hazard (two different Kes-like people sharing an email is a contradiction
// a human should resolve, not something discovery should overwrite).
export async function upsertAlias(input: UpsertAliasInput): Promise<InboxIdentityAlias> {
  const existing = await InboxIdentityAlias.findOne({
    where: { alias_type: input.aliasType, alias_value: input.aliasValue },
  });
  if (existing) return existing;

  return InboxIdentityAlias.create({
    canonical_name: input.canonicalName,
    alias_type: input.aliasType,
    alias_value: input.aliasValue,
    provider: input.provider ?? null,
    external_person_id: input.externalPersonId ?? null,
    confidence: input.confidence ?? 60,
    verified_by: input.verifiedBy ?? null,
    verified_at: input.verifiedBy ? new Date() : null,
  } as any);
}

export async function verifyAlias(aliasId: string, verifiedBy: string): Promise<void> {
  await InboxIdentityAlias.update(
    { confidence: 100, verified_by: verifiedBy, verified_at: new Date() },
    { where: { id: aliasId } }
  );
}
