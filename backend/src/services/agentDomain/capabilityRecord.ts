/**
 * The capability matrix contract, and the loader for the ten domain files.
 *
 * Run `20261007-school-agent-factory` (T05), session CC-20261006-a4k7.
 *
 * WHY THE DATA IS JSON AND NOT TYPESCRIPT. 443 capability records across ten domains, each
 * carrying its own evidence citations, workflow, exceptions, tool list and per-release behaviour.
 * Hand-maintaining that as TS literals would guarantee drift; the files are the research output and
 * are reviewable as such. This module is the typed seam over them, and its tests are what stop a
 * malformed record reaching anything downstream.
 *
 * THE RECORDS ARE PLANNING DATA. Nothing here grants a capability, enables an agent, or authorizes
 * an action. Every record is `requirement_validation_state: 'draft'` because no manager has
 * validated one, and the loader refuses a record that claims otherwise -- see
 * `assertDraftOnlyInvariant`. The expected count of `confirmed` capabilities at the end of this
 * phase is ZERO, and that is reported rather than dressed up as coverage.
 *
 * SOURCED FROM FOUR INPUTS, per the owner's amendment: verified legacy-agent functionality,
 * existing application functionality, the manager's own responsibilities, and proposed new
 * responsibilities including DA work transitioning to AI. Legacy inheritance is ONE input, not the
 * definition -- `product_experience` has zero legacy rows and 25 capabilities.
 */

import * as fs from 'fs';
import * as path from 'path';
import { AGENT_DOMAIN_KEYS, type AgentDomainKey } from './agentDomainRegistry';

/** Which of the four sources a capability came from. */
export type CapabilityClassification =
  | 'inherited'
  | 'existing_application'
  | 'manager_defined'
  | 'proposed_new';

/** What exists in the application today. Independent of whether anyone validated the requirement. */
export type ImplementationState = 'absent' | 'partial' | 'implemented' | 'unknown';

/** Whether a human has confirmed the requirement. Independent of what is built. */
export type RequirementValidationState = 'draft' | 'confirmed' | 'rejected';

/** How a legacy agent row was resolved. Every row gets exactly one. */
export type LegacyDisposition =
  | 'migrated_to_capability'
  | 'retired'
  | 'superseded'
  | 'unknown';

export interface ReleaseBehaviour {
  readonly autonomy: string;
  readonly behaviour: string;
  readonly acceptance_criteria: string;
}

export interface CapabilityRecord {
  readonly capability_id: string;
  readonly name: string;
  readonly business_outcome: string;
  readonly intended_users: ReadonlyArray<string>;
  readonly classification: CapabilityClassification;
  readonly source: string;
  readonly supporting_evidence: ReadonlyArray<string>;
  readonly implementation_state: ImplementationState;
  readonly requirement_validation_state: RequirementValidationState;
  readonly validation_dependency: string;
  readonly inputs: ReadonlyArray<string>;
  readonly outputs: ReadonlyArray<string>;
  readonly workflow: ReadonlyArray<string>;
  readonly exceptions: ReadonlyArray<string>;
  readonly dependencies: ReadonlyArray<string>;
  readonly application_pages: ReadonlyArray<string>;
  readonly apis: ReadonlyArray<string>;
  readonly source_modules: ReadonlyArray<string>;
  readonly required_tools: ReadonlyArray<string>;
  readonly permissions_by_environment?: Record<string, { human: string[]; agent: string[] }>;
  readonly human_decision: boolean;
  readonly starting_autonomy: string;
  readonly max_permitted_autonomy: string;
  readonly max_autonomy_rationale?: string;
  readonly blocked_by: ReadonlyArray<string>;
  readonly release_behaviour: ReadonlyArray<ReleaseBehaviour>;
  /** Domain-specific extras: pii_exposure, financial_consequence, public_facing, reaches_learners… */
  readonly [extra: string]: unknown;
}

export interface LegacyDispositionRecord {
  readonly agent_name: string;
  readonly proposed_kind: string;
  readonly disposition: LegacyDisposition;
  readonly capability_id: string | null;
  readonly reason: string;
  readonly becomes_tool_on?: string | null;
}

export interface DomainCapabilityMatrix {
  readonly domain_key: AgentDomainKey;
  readonly accountable_human: string;
  readonly manager_identity_id: string;
  readonly researched_at: string;
  readonly agent_id?: string | null;
  readonly agent_name?: string | null;
  readonly capabilities: ReadonlyArray<CapabilityRecord>;
  readonly legacy_dispositions: ReadonlyArray<LegacyDispositionRecord>;
  readonly notes?: ReadonlyArray<string>;
  readonly [extra: string]: unknown;
}

/** The eight capabilities `executionPolicy.ts:33` denies by default. A matrix may never REQUEST one. */
export const DENIED_CAPABILITIES: ReadonlyArray<string> = [
  'production_deploy',
  'production_database',
  'dns',
  'live_email',
  'cloud_resource_deletion',
  'push_to_protected_main',
  'unbounded_network',
  'secret_exfiltration',
];

const DIR = path.join(__dirname, 'capabilities');

let cache: Map<string, DomainCapabilityMatrix> | null = null;

/** Load one domain's matrix. Throws on a malformed file rather than returning a partial one. */
export function loadDomainMatrix(domainKey: string): DomainCapabilityMatrix {
  const all = loadAllMatrices();
  const m = all.get(domainKey);
  if (!m) throw new Error(`No capability matrix for domain '${domainKey}'`);
  return m;
}

export function loadAllMatrices(): Map<string, DomainCapabilityMatrix> {
  if (cache) return cache;
  const out = new Map<string, DomainCapabilityMatrix>();
  for (const key of AGENT_DOMAIN_KEYS) {
    const p = path.join(DIR, `${key}.json`);
    if (!fs.existsSync(p)) throw new Error(`Capability matrix missing for '${key}' at ${p}`);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as DomainCapabilityMatrix;
    if (parsed.domain_key !== key) {
      throw new Error(`Matrix at ${key}.json declares domain_key '${parsed.domain_key}'`);
    }
    out.set(key, parsed);
  }
  cache = out;
  return out;
}

export function allCapabilities(): CapabilityRecord[] {
  return [...loadAllMatrices().values()].flatMap((m) => [...m.capabilities]);
}

/**
 * Nothing is validated. Throws if any record claims otherwise.
 *
 * This is the invariant that keeps the whole exercise honest: shipped behaviour is evidence of
 * `implementation_state`, never of requirement validation. Reese and Dara have capabilities that
 * demonstrably run in production today, and every one of them is still `draft`.
 */
export function assertDraftOnlyInvariant(): void {
  const bad = allCapabilities().filter((c) => c.requirement_validation_state !== 'draft');
  if (bad.length > 0) {
    throw new Error(
      `${bad.length} capabilities are not 'draft' (${bad.slice(0, 3).map((c) => c.capability_id).join(', ')}). `
      + 'No manager has validated anything in this phase, so a non-draft record is either a '
      + 'fabricated approval or a real one that has not been recorded where it belongs.',
    );
  }
}

/** Counts the per-domain report needs. Three separate figures, deliberately never summed. */
export interface DomainCounts {
  readonly domain_key: string;
  readonly legacy_rows_analyzed: number;
  readonly distinct_capabilities: number;
  readonly confirmed: number;
  readonly draft: number;
  readonly unique_tools_required: number;
  readonly complete_release_coverage: number;
  readonly outstanding_manager_decisions: number;
  readonly by_classification: Record<CapabilityClassification, number>;
  readonly by_implementation: Record<ImplementationState, number>;
}

export function countsForDomain(domainKey: string): DomainCounts {
  const m = loadDomainMatrix(domainKey);
  const caps = m.capabilities;
  const tools = new Set<string>();
  for (const c of caps) for (const t of c.required_tools) tools.add(t);

  const byClass: Record<string, number> = {
    inherited: 0, existing_application: 0, manager_defined: 0, proposed_new: 0,
  };
  const byImpl: Record<string, number> = { absent: 0, partial: 0, implemented: 0, unknown: 0 };
  for (const c of caps) {
    byClass[c.classification] = (byClass[c.classification] ?? 0) + 1;
    byImpl[c.implementation_state] = (byImpl[c.implementation_state] ?? 0) + 1;
  }

  return {
    domain_key: domainKey,
    legacy_rows_analyzed: m.legacy_dispositions.length,
    distinct_capabilities: caps.length,
    confirmed: caps.filter((c) => c.requirement_validation_state === 'confirmed').length,
    draft: caps.filter((c) => c.requirement_validation_state === 'draft').length,
    unique_tools_required: tools.size,
    // A capability has complete coverage only when it declares behaviour for at least one release
    // AND is validated. Both halves matter: release behaviour with no validation is a plan nobody
    // agreed to.
    complete_release_coverage: caps.filter(
      (c) => c.release_behaviour.length > 0 && c.requirement_validation_state === 'confirmed',
    ).length,
    outstanding_manager_decisions: caps.filter((c) => c.requirement_validation_state === 'draft').length,
    by_classification: byClass as Record<CapabilityClassification, number>,
    by_implementation: byImpl as Record<ImplementationState, number>,
  };
}

export function allDomainCounts(): DomainCounts[] {
  return AGENT_DOMAIN_KEYS.map((k) => countsForDomain(k));
}

/** For tests and the handoff: reset the memoised load. */
export function __clearMatrixCache(): void {
  cache = null;
}
