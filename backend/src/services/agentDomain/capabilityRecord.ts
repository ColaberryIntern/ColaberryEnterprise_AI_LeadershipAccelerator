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

/**
 * The capabilities the execution policy denies by default, RE-EXPORTED from the policy itself.
 *
 * This was a hardcoded copy of the eight values. The two lists were byte-identical, so nothing was
 * wrong today -- but the test asserting `length === 8` was validating the local literal, which
 * means a ninth denial added to the real policy would never have been observed here. A second copy
 * of a security list is a second thing to keep true.
 */
export { DENIED_CAPABILITIES } from '../delivery/execution/executionPolicy';

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
    assertRecordContract(key, parsed);
    out.set(key, parsed);
  }
  cache = out;
  return out;
}

/**
 * The fields every capability record MUST carry, as the amendment specifies them.
 *
 * `implementation_state` and `requirement_validation_state` are listed separately and deliberately:
 * the amendment asks for them as two distinct fields, because what exists and what a human has
 * agreed to are different questions and collapsing them is how shipped behaviour gets read as
 * validation.
 */
export const REQUIRED_CAPABILITY_FIELDS: ReadonlyArray<string> = Object.freeze([
  'capability_id', 'name', 'business_outcome', 'intended_users', 'classification', 'source',
  'supporting_evidence', 'implementation_state', 'requirement_validation_state',
  'validation_dependency', 'inputs', 'outputs', 'workflow', 'exceptions', 'required_tools',
  'human_decision', 'starting_autonomy', 'max_permitted_autonomy', 'release_behaviour',
]);

const IMPLEMENTATION_STATES = ['absent', 'partial', 'implemented', 'unknown'];
const VALIDATION_STATES = ['draft', 'confirmed', 'rejected'];

/**
 * Enforces the record contract at LOAD time, so the loader's docblock is true.
 *
 * It was not. `JSON.parse(...) as DomainCapabilityMatrix` is an unchecked cast, and a verifier
 * proved the consequence by deleting `implementation_state` from one record: all 256 tests passed,
 * exit 0. A cast is a promise to the compiler, not a check on the data.
 */
export function assertRecordContract(key: string, m: DomainCapabilityMatrix): void {
  const problems: string[] = [];
  if (!Array.isArray(m.capabilities)) problems.push(`${key}: capabilities is not an array`);
  if (m.capabilities && m.capabilities.length === 0) {
    // An empty bucket does not mean an empty job -- the amendment says so outright -- so an empty
    // domain is a loading error rather than a finding.
    problems.push(`${key}: zero capabilities`);
  }
  for (const c of m.capabilities ?? []) {
    const id = c?.capability_id ?? '<no capability_id>';
    for (const f of REQUIRED_CAPABILITY_FIELDS) {
      if (!(f in (c as object))) problems.push(`${key}/${id}: missing '${f}'`);
    }
    if (c && !IMPLEMENTATION_STATES.includes(c.implementation_state)) {
      problems.push(`${key}/${id}: implementation_state '${c.implementation_state}' is not one of ${IMPLEMENTATION_STATES.join('|')}`);
    }
    if (c && !VALIDATION_STATES.includes(c.requirement_validation_state)) {
      problems.push(`${key}/${id}: requirement_validation_state '${c.requirement_validation_state}' is not one of ${VALIDATION_STATES.join('|')}`);
    }
  }
  if (problems.length > 0) {
    // Named, not counted: a count tells nobody which record to go and fix.
    throw new Error(`CapabilityContractViolation: ${problems.slice(0, 10).join('; ')}`
      + (problems.length > 10 ? ` (and ${problems.length - 10} more)` : ''));
  }
}

/**
 * What the owner ruled about one undomained legacy agent, and when.
 *
 * AF6.1, Ali Muwwakkil, 2026-11-01: retire the eight that have never run, absorb the eight that
 * run constantly, park the five live production-only rows.
 *
 * `ruling` is the DECISION. `disposition` is what that decision has so far been able to achieve,
 * and the two are deliberately separate, because they came apart on this very bucket:
 *
 *  - `retire` reaches a terminal `disposition: 'retired'` immediately. Nothing more is needed.
 *  - `absorb` CANNOT, because absorbing an agent means naming the domain that absorbs it, and
 *    these eight are undomained precisely because they serve two domains at once. The ruling is
 *    recorded; the row stays `unresolved` until a domain owner exists.
 *  - `parked` is an explicit deferral. It is a recorded answer, not a decision, and it must never
 *    be counted as one.
 *
 * Collapsing these into one field would let "Ali decided" stand in for "the agent has a home",
 * and sixteen rulings would read as sixteen resolved rows when only eight are.
 */
export type OwnerRuling = 'retire' | 'absorb' | 'parked';

export interface OwnerDecision {
  readonly ruling: OwnerRuling;
  readonly decided_by: string;
  readonly decided_on: string;
  /** What still stands between this ruling and a terminal disposition, where anything does. */
  readonly blocked_on?: string;
}

export interface UnresolvedLegacyRow {
  readonly agent_name: string;
  readonly proposed_kind: string | null;
  readonly source: string | null;
  /** `retired` is terminal. `unresolved` means this row still has no home. */
  readonly disposition: 'unresolved' | 'retired';
  readonly capability_id: null;
  readonly reason: string;
  readonly owner_decision?: OwnerDecision;
}

export interface UnresolvedBucket {
  readonly bucket: 'unresolved';
  readonly legacy_row_count: number;
  readonly needs_owner_decision: boolean;
  readonly rows: ReadonlyArray<UnresolvedLegacyRow>;
}

/**
 * The legacy rows that belong to no domain.
 *
 * They were only ever in the gitignored run directory, so "all 246 legacy rows are accounted for"
 * was unmet in anything that ships, and none of them carried a `disposition`. A run directory is
 * scratch; the claim that no legacy functionality is silently lost cannot rest on a file that is
 * not in the repository.
 *
 * The filename is underscore-prefixed because this is NOT a domain. `loadAllMatrices` reads by
 * explicit domain key, so it can never pick this up by accident.
 */
export function loadUnresolvedBucket(): UnresolvedBucket {
  const p = path.join(DIR, '_unresolved.json');
  if (!fs.existsSync(p)) throw new Error(`Unresolved legacy bucket missing at ${p}`);
  const parsed = JSON.parse(fs.readFileSync(p, 'utf8')) as UnresolvedBucket;
  const problems: string[] = [];
  if (parsed.bucket !== 'unresolved') problems.push(`bucket is '${parsed.bucket}'`);
  if (parsed.rows.length !== parsed.legacy_row_count) {
    problems.push(`legacy_row_count ${parsed.legacy_row_count} but ${parsed.rows.length} rows`);
  }
  for (const r of parsed.rows) {
    if (r.disposition !== 'unresolved' && r.disposition !== 'retired') {
      problems.push(`${r.agent_name}: disposition '${r.disposition}'`);
    }
    if (!r.reason || r.reason.trim().length === 0) problems.push(`${r.agent_name}: no reason`);

    /* A row may only leave `unresolved` on a recorded ruling. Without this, widening the
       disposition union is just a licence to mark rows retired with nobody's name on it. */
    if (r.disposition === 'retired' && !r.owner_decision) {
      problems.push(`${r.agent_name}: disposition 'retired' with no owner_decision`);
    }
    const d = r.owner_decision;
    if (d) {
      if (!d.decided_by || !d.decided_on) {
        problems.push(`${r.agent_name}: owner_decision without a decider and a date`);
      }
      if (!['retire', 'absorb', 'parked'].includes(d.ruling)) {
        problems.push(`${r.agent_name}: ruling '${d.ruling}'`);
      }
      /* The two directions that would let a ruling be misread as more than it is. */
      if (d.ruling === 'retire' && r.disposition !== 'retired') {
        problems.push(`${r.agent_name}: ruled retire but disposition is '${r.disposition}'`);
      }
      if (d.ruling !== 'retire' && r.disposition !== 'unresolved') {
        problems.push(`${r.agent_name}: ruled '${d.ruling}' but disposition is '${r.disposition}'`);
      }
      /* `absorb` and `parked` both leave work behind. Saying what is a required field, because
         "decided" with nothing named is how a ruling quietly becomes a resolution. */
      if (d.ruling !== 'retire' && !d.blocked_on) {
        problems.push(`${r.agent_name}: ruled '${d.ruling}' without naming what it is blocked on`);
      }
    }
  }

  /* The flag must follow the rows. A bucket that still holds unresolved rows while claiming no
     owner decision is needed is the exact shape of a green board over unfinished work. */
  const stillOpen = parsed.rows.some((r) => r.disposition === 'unresolved');
  if (parsed.needs_owner_decision !== stillOpen) {
    problems.push(`needs_owner_decision is ${parsed.needs_owner_decision} but `
      + `${stillOpen ? 'rows remain unresolved' : 'every row is resolved'}`);
  }

  if (problems.length > 0) throw new Error(`UnresolvedBucketViolation: ${problems.join('; ')}`);
  return parsed;
}

/** Every legacy agent name this phase accounts for: domained dispositions plus the bucket. */
export function allAccountedLegacyNames(): string[] {
  const domained = [...loadAllMatrices().values()]
    .flatMap((m) => m.legacy_dispositions.map((d) => d.agent_name));
  return [...domained, ...loadUnresolvedBucket().rows.map((r) => r.agent_name)];
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
