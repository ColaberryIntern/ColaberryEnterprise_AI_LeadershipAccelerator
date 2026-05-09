/**
 * federationAnonymizationHelpers — Phase 19. Strip identifiers + hash
 * signatures before archetypes leave a project boundary.
 *
 * Architectural commitment: shared archetypes carry ONLY anonymized
 * sequence patterns + outcome statistics. Every project-specific field
 * is removed BEFORE the archetype enters the federated registry.
 *
 * v1 anonymization is identifier stripping + djb2-style hashing. NOT
 * cryptographic / differential privacy. Future phases may add real
 * privacy guarantees if regulators demand it.
 */

import type {
  AnonymizedArchetypePayload, ArchetypeKind,
} from './federationTypes';

// Field names that MUST never appear in shared archetypes.
const IDENTIFYING_FIELDS = new Set([
  'project_id', 'capability_id', 'cluster_signature', 'subject_id',
  'rationale', 'message', 'mutation_id', 'plan_id', 'task_id',
]);

/**
 * Anonymize a structural step sequence. Replaces project-specific
 * subjects with their `kind` placeholder; preserves the ordering.
 */
export function anonymizeStepSequence(sequence: ReadonlyArray<string>): ReadonlyArray<string> {
  return sequence.map(s => {
    // If the step contains a colon (e.g. "rollback_target:cap-x"),
    // keep only the prefix.
    const colon = s.indexOf(':');
    return colon >= 0 ? s.slice(0, colon) : s;
  });
}

/**
 * djb2-style hash for archetype signatures. Deterministic, replay-safe,
 * collision-resistant enough for v1. Produces a 16-char hex string.
 */
export function hashArchetypeSignature(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) + input.charCodeAt(i);
    h = h & h;
  }
  // Mix in a stable secondary hash so signatures are well-distributed
  // even for short inputs.
  let secondary = 0xdeadbeef ^ input.length;
  for (let i = input.length - 1; i >= 0; i--) {
    secondary = (secondary * 33) ^ input.charCodeAt(i);
  }
  const a = (h >>> 0).toString(16).padStart(8, '0');
  const b = (secondary >>> 0).toString(16).padStart(8, '0');
  return `arch-${a}${b}`;
}

/**
 * Strip identifying fields from a free-form payload. Used as a
 * defense-in-depth check before archetype publication.
 */
export function stripIdentifyingFields(payload: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    if (IDENTIFYING_FIELDS.has(k)) continue;
    if (typeof v === 'string' && IDENTIFYING_FIELDS.has(k.toLowerCase())) continue;
    // Recursively strip nested objects.
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = stripIdentifyingFields(v as Record<string, unknown>);
    } else if (Array.isArray(v)) {
      out[k] = v.map(item => typeof item === 'object' && item !== null
        ? stripIdentifyingFields(item as Record<string, unknown>)
        : item);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build an anonymized archetype payload from raw inputs. The signature
 * is the hash of (kind, anonymized_step_sequence, outcome class).
 */
export interface BuildAnonymizedArchetypeInput {
  readonly kind: ArchetypeKind;
  readonly raw_step_sequence: ReadonlyArray<string>;
  readonly observed_count: number;
  readonly success_rate: number;
  readonly avg_minutes_to_stabilize: number;
  readonly notes?: ReadonlyArray<string>;
}

export function buildAnonymizedArchetype(input: BuildAnonymizedArchetypeInput): AnonymizedArchetypePayload {
  const step_sequence = anonymizeStepSequence(input.raw_step_sequence);
  // Outcome bucket — successful / mixed / failing — bucketed so two
  // similar archetypes with slightly different success rates hash to
  // the same signature.
  const outcomeBucket = input.success_rate >= 80 ? 'successful'
    : input.success_rate >= 50 ? 'mixed' : 'failing';
  const archetype_signature = hashArchetypeSignature(
    `${input.kind}::${step_sequence.join('->')}::${outcomeBucket}`,
  );
  // Notes are preserved but checked for identifying fields. If a note
  // mentions a removed identifying field, drop it.
  const cleanedNotes = (input.notes ?? []).filter(note =>
    !Array.from(IDENTIFYING_FIELDS).some(f => note.toLowerCase().includes(f.toLowerCase()))
  );
  return {
    archetype_signature,
    kind: input.kind,
    step_sequence,
    observed_count: input.observed_count,
    success_rate: input.success_rate,
    avg_minutes_to_stabilize: input.avg_minutes_to_stabilize,
    notes: cleanedNotes,
  };
}

export const _IDENTIFYING_FIELDS_FOR_TESTS = IDENTIFYING_FIELDS;
