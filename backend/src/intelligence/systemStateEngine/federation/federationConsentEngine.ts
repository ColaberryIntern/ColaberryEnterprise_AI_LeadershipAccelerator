/**
 * federationConsentEngine — Phase 19. Per-project consent profiles
 * for cross-organization governance archetype federation.
 *
 * Architectural commitment (per the Phase 19 stress-test + addendum):
 *   - Federation requires EXPLICIT opt-in. Default profile is fully
 *     ISOLATED.
 *   - Every consent change writes a `federation_consent_updated` audit
 *     row.
 *   - Hard-veto rule: when `federation_enabled === false`, ALL sharing
 *     and consumption is blocked regardless of granular permissions.
 *   - Consumers cannot mutate other projects' consent state.
 */

import type {
  FederationConsentProfile, ArchetypeKind, FederationIsolationTier,
} from './federationTypes';

const ARCHETYPE_KINDS: ReadonlyArray<ArchetypeKind> = [
  'contradiction_archetype',
  'recovery_archetype',
  'routing_archetype',
  'governance_drift_signature',
  'stabilization_pattern',
];

const projectConsent = new Map<string, FederationConsentProfile>();

function defaultProfile(project_id: string): FederationConsentProfile {
  const allOff = ARCHETYPE_KINDS.reduce((acc, k) => { acc[k] = false; return acc; }, {} as Record<ArchetypeKind, boolean>);
  return {
    project_id,
    organization_id: null,
    federation_enabled: false,
    share_permissions: { ...allOff },
    consume_permissions: { ...allOff },
    anonymization_level: 'standard',
    isolation_tier: 'isolated',
    updated_at: new Date().toISOString(),
    updated_by: null,
  };
}

export function readConsent(project_id: string): FederationConsentProfile {
  return projectConsent.get(project_id) ?? defaultProfile(project_id);
}

export interface UpdateConsentInput {
  readonly project_id: string;
  readonly organization_id?: string | null;
  readonly federation_enabled?: boolean;
  readonly share_permissions?: Partial<Record<ArchetypeKind, boolean>>;
  readonly consume_permissions?: Partial<Record<ArchetypeKind, boolean>>;
  readonly anonymization_level?: 'standard' | 'strict';
  readonly updated_by: string;
}

export async function updateConsent(input: UpdateConsentInput): Promise<FederationConsentProfile> {
  const current = readConsent(input.project_id);
  const next: FederationConsentProfile = {
    project_id: input.project_id,
    organization_id: input.organization_id !== undefined ? input.organization_id : current.organization_id,
    federation_enabled: input.federation_enabled !== undefined ? input.federation_enabled : current.federation_enabled,
    share_permissions: { ...current.share_permissions, ...input.share_permissions } as Record<ArchetypeKind, boolean>,
    consume_permissions: { ...current.consume_permissions, ...input.consume_permissions } as Record<ArchetypeKind, boolean>,
    anonymization_level: input.anonymization_level ?? current.anonymization_level,
    isolation_tier: deriveIsolationTier({
      federation_enabled: input.federation_enabled !== undefined ? input.federation_enabled : current.federation_enabled,
      organization_id: input.organization_id !== undefined ? input.organization_id : current.organization_id,
      share_permissions: { ...current.share_permissions, ...input.share_permissions } as Record<ArchetypeKind, boolean>,
      consume_permissions: { ...current.consume_permissions, ...input.consume_permissions } as Record<ArchetypeKind, boolean>,
    }),
    updated_at: new Date().toISOString(),
    updated_by: input.updated_by,
  };
  projectConsent.set(input.project_id, next);

  await writeConsentAudit(next, input.updated_by);
  return next;
}

function deriveIsolationTier(opts: {
  federation_enabled: boolean;
  organization_id: string | null;
  share_permissions: Record<ArchetypeKind, boolean>;
  consume_permissions: Record<ArchetypeKind, boolean>;
}): FederationIsolationTier {
  if (!opts.federation_enabled) return 'isolated';
  if (!opts.organization_id) return 'local_only';
  const sharesAny = Object.values(opts.share_permissions).some(Boolean);
  const consumesAny = Object.values(opts.consume_permissions).some(Boolean);
  const sharesAll = ARCHETYPE_KINDS.every(k => opts.share_permissions[k]);
  const consumesAll = ARCHETYPE_KINDS.every(k => opts.consume_permissions[k]);
  if (!sharesAny && consumesAny) return 'visibility_limited';
  if (sharesAll && consumesAll) return 'organizational';
  if (sharesAny || consumesAny) return 'restricted';
  return 'local_only';
}

/**
 * Helper for the registry: can this project SHARE archetypes of the
 * given kind right now? Hard-veto: federation_enabled must be true AND
 * organization_id must be set AND share_permissions[kind] must be true.
 */
export function canShare(project_id: string, kind: ArchetypeKind): boolean {
  const p = readConsent(project_id);
  return p.federation_enabled && p.organization_id !== null && p.share_permissions[kind] === true;
}

/**
 * Helper for the registry: can this project CONSUME archetypes of the
 * given kind right now?
 */
export function canConsume(project_id: string, kind: ArchetypeKind): boolean {
  const p = readConsent(project_id);
  return p.federation_enabled && p.organization_id !== null && p.consume_permissions[kind] === true;
}

async function writeConsentAudit(profile: FederationConsentProfile, operator_id: string): Promise<void> {
  try {
    const { default: GovernanceAuditEntry } = await import('../../../models/GovernanceAuditEntry');
    await GovernanceAuditEntry.create({
      project_id: profile.project_id,
      kind: 'federation_consent_updated',
      subject_id: null,
      payload: profile,
      operator_id,
      recorded_at: new Date(),
    } as any);
  } catch (err: any) {
    console.warn('[federationConsentEngine] audit write failed:', err?.message);
  }
}

export function _resetFederationConsent(): void {
  projectConsent.clear();
}

export const _ARCHETYPE_KINDS_FOR_TESTS = ARCHETYPE_KINDS;
