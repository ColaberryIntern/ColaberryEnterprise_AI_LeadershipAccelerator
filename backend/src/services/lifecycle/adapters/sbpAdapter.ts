/**
 * SBP → manifest references. Read-only, one-directional, no table merger.
 *
 * SBP models a STUDENT BUILD: requirements with kinds and priorities, releases, vertical-slice
 * stories, optional scoped agents. Its governing principle is that nothing waits on a human, and
 * that principle is preserved — this adapter reads a plan, it does not gate one.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *   - It does not write, and has no store or sequelize import, so it structurally cannot add a
 *     coordinator column to `build_plans` or `build_intake`.
 *   - It does not treat `agents` as present. `BuildPlan.agents` is OPTIONAL and
 *     `BUILD_PLAN_JSON_SCHEMA.required` omits it, because agent scoping runs AFTER the gate on
 *     purpose — "a scoping failure must never cost them a publishable build". An absent agent
 *     list is therefore a legitimate state, not a defect, and maps to an empty runtime list.
 *   - It does not promote a CONSTRAINT into a requirement needing story coverage.
 *     `planContract.requiresStoryCoverage` already encodes that distinction, and a constraint is
 *     context for the stories that use it, not a story of its own.
 *   - It does not invent provenance or confirmation.
 *
 * Contract: docs/project-lifecycle/blueprint-contract.md. Seam: architecture.md §2.
 */
import type { SourceState } from '../sourceIdentity';
import { emptyRefs, type ManifestRefs, type PinnedRef, type SourceRef } from './manifestRefs';

/** Structural shapes, not imports from planContract — see the note in factoryAdapter. */
export interface SbpRequirementLike {
  id: string;
  kind?: string | null;
  priority?: string | null;
  /** Whether a human confirmed this requirement, where SBP records that. */
  human_confirmed?: boolean | null;
  source?: string | null;
}

export interface SbpStoryLike { id: string; release_id?: string | null }
export interface SbpReleaseLike { id: string }
export interface SbpAgentLike { id: string }

export interface SbpAdapterInput {
  projectId: string;
  /** The plan revision these records were read at. */
  planVersion: number | null;
  requirements: ReadonlyArray<SbpRequirementLike>;
  releases?: ReadonlyArray<SbpReleaseLike>;
  stories?: ReadonlyArray<SbpStoryLike>;
  /** OPTIONAL by design — see the header. Absent means scoping has not run, not that it failed. */
  agents?: ReadonlyArray<SbpAgentLike> | null;
  /** Builder agents, kept in their own namespace. */
  builderAgentIds?: ReadonlyArray<string>;
}

/** SBP's requirement kinds that are context rather than deliverable work. */
const CONSTRAINT_KINDS: ReadonlySet<string> = new Set(['CONSTRAINT']);

export function isConstraintKind(kind: string | null | undefined): boolean {
  return Boolean(kind && CONSTRAINT_KINDS.has(kind));
}

/**
 * SBP records far less state than the Factory, so the mapping is conservative on purpose: a
 * requirement that has not been explicitly confirmed is `heard`, never upgraded by inference.
 */
export function sbpRequirementToSourceState(r: SbpRequirementLike): SourceState {
  if (r.human_confirmed === true) return 'confirmed';
  return 'heard';
}

/** Translate an SBP plan into pinned references. Pure: no writes, no I/O. */
export function sbpToManifestRefs(input: SbpAdapterInput): ManifestRefs {
  const refs = emptyRefs('sbp', input.projectId);
  const rev = input.planVersion ?? null;

  refs.sources = input.requirements.map((r): SourceRef => ({
    id: r.id,                       // SBP's own id, so the pointer still resolves there
    revision: rev,
    source: 'build_plans#requirements',
    state: sbpRequirementToSourceState(r),
    provenanceKind: r.source && r.source.trim() ? r.source : null,
  }));

  const pin = (ids: ReadonlyArray<string>, source: string): PinnedRef[] =>
    ids.map((id) => ({ id, revision: rev, source }));

  // Releases and stories are DOWNSTREAM implementation work, not business processes. Putting
  // them in `processes` would conflate the software build with the business the software serves,
  // which is the distinction the whole business-task contract rests on.
  refs.downstream = [
    ...pin((input.releases ?? []).map((x) => x.id), 'build_plans#releases'),
    ...pin((input.stories ?? []).map((x) => x.id), 'build_plans#stories'),
  ];

  refs.agents = {
    // `agents` absent or null is legitimate: scoping runs after the gate and may not have run.
    runtime: pin((input.agents ?? []).map((a) => a.id), 'build_plans#agents'),
    builder: pin(input.builderAgentIds ?? [], 'builder_agents'),
  };

  // SBP has no track concept. The arrays stay present-but-empty so a reader can tell "no
  // mappings" from "this origin has no notion of mappings" without special-casing.
  return refs;
}

/**
 * Requirements that must be covered by at least one story, excluding constraints.
 *
 * Mirrors `planContract.requiresStoryCoverage` rather than reimplementing the judgement: a
 * CONSTRAINT ("must use PaySimple for payments") is context for the stories that use it, and
 * demanding a story for it manufactures the "layer story" the plan contract exists to prevent.
 */
export function requirementsNeedingCoverage(
  requirements: ReadonlyArray<SbpRequirementLike>,
): string[] {
  return requirements.filter((r) => !isConstraintKind(r.kind)).map((r) => r.id);
}
