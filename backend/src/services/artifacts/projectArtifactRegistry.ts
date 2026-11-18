/**
 * projectArtifactRegistry - one answer per project: what the plan REQUIRES, what EXISTS, and
 * what the missing thing was supposed to be.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS WHEN A PER-PROJECT ARTIFACTS ENDPOINT ALREADY DID
 * ---------------------------------------------------------------------------
 * `GET /api/admin/projects/:projectId/artifacts` has existed for a long time, backed by
 * `getProjectArtifacts`, which reads `project_artifacts`. Measured on production 2026-11-18 that
 * table holds **4 rows across 3 projects**, while the artifacts students have actually produced,
 * **1,018 of them across 65 projects**, live in `runtime_portfolio_artifacts`, reachable only
 * through `projects.enrollment_id`.
 *
 * So the admin UI already had a page for this and it was empty for 96% of projects. That is this
 * workstream's own problem wearing a different hat: a surface that looks like oversight and shows
 * nothing. The existing endpoint is left alone, because other things read it; this is the query
 * that answers the question.
 *
 * ---------------------------------------------------------------------------
 * THREE SOURCES, AND WHAT EACH ONE IS AUTHORITATIVE FOR
 * ---------------------------------------------------------------------------
 *   the published plan          what is REQUIRED. A0's validator resolves each story's contract,
 *                               so a malformed one is reported rather than silently skipped.
 *   story_artifact_verifications what was SEEN IN THE REPOSITORY, and at which commit. A2 writes
 *                               one row per satisfied key per commit, so it carries the provenance
 *                               the ticket asks for: the commit that produced it.
 *   runtime_portfolio_artifacts  what EXISTS on the platform, whether or not any contract asked
 *                               for it. Mapped onto catalog types through
 *                               `catalogTypeForProductionKind`, which returns undefined for a kind
 *                               nothing claims, and that is rendered as unclassified rather than
 *                               guessed.
 *
 * ---------------------------------------------------------------------------
 * AN EMPTY REQUIREMENT LIST IS REPORTED AS SUCH, NOT AS COMPLIANCE
 * ---------------------------------------------------------------------------
 * 0 of 67 published plans carry a contract today. A registry that printed "0 missing" for those
 * would read as a clean bill of health for a project that has promised nothing, which is the
 * single most important thing for this page NOT to do. `requires_nothing` is therefore its own
 * state, distinct from `all_satisfied`, and the page must say the two differently.
 *
 * Read-only. Every query here is a SELECT; nothing in this module writes.
 */

import { QueryTypes } from 'sequelize';

import { sequelize } from '../../config/database';
import { getPublishedPlan } from '../sbp/planStore';
import { validateArtifactContract } from './storyArtifactContract';
import type { ResolvedArtifact } from './storyArtifactContract';
import { catalogTypeForProductionKind, artifactType } from './storyArtifactTypes';

/** What the registry can say about one required artifact. */
export type RequiredArtifactState =
  /** A2 saw it in the repository, and the row names the commit. */
  | 'satisfied'
  /** A2 saw it, and the contract named contents nobody has read. */
  | 'present_content_unchecked'
  /** Declared, repo evidence, and no verification row for it. */
  | 'missing'
  /** Declared and handed over on the platform, which the repository check cannot see. */
  | 'not_repo_evidence';

export interface RequiredArtifact {
  story_id: string;
  key: string;
  name: string;
  type: string;
  /** What the person is judged by. Straight from the contract, never paraphrased here. */
  evaluation_criteria: string;
  /** Where it was promised, or null for a platform artifact. */
  repo_path: string | null;
  state: RequiredArtifactState;
  /** The commit it was seen at, when A2 recorded one. */
  commit_sha: string | null;
  seen_at: string | null;
}

export interface ExistingArtifact {
  /** The raw `kind` as production stores it. */
  kind: string;
  /** The catalog type it is read as, or null when nothing claims the kind. */
  catalog_type: string | null;
  title: string;
  created_at: string;
}

export interface StoryWithMalformedContract {
  story_id: string;
  /** A0's refusal codes, so a malformed contract is visible rather than absent. */
  refusals: string[];
}

export type RegistryVerdict =
  /** The plan requires artifacts and every one this check can see is handed over. */
  | 'all_satisfied'
  /** The plan requires artifacts and at least one is outstanding. */
  | 'outstanding'
  /** The plan requires NOTHING. Not the same as compliance: see the header. */
  | 'requires_nothing'
  /** There is no published plan to require anything. */
  | 'no_plan';

export interface ProjectArtifactRegistry {
  project_id: string;
  plan_version: number | null;
  verdict: RegistryVerdict;
  /** One sentence for the person reading the page. Never implies more than was checked. */
  headline: string;
  required: RequiredArtifact[];
  /** Keys still owed, named, so the page does not make the reader scan for them. */
  outstanding_keys: string[];
  existing: ExistingArtifact[];
  /** Artifacts whose production kind maps to no catalog type. Rendered, never hidden. */
  unclassified: ExistingArtifact[];
  malformed: StoryWithMalformedContract[];
  counts: {
    stories_total: number;
    stories_with_contract: number;
    required: number;
    satisfied: number;
    outstanding: number;
    existing: number;
    unclassified: number;
  };
  /** Set when something could not be read. The page must not render a gap as a zero. */
  warnings: string[];
}

interface VerificationRow {
  story_id: string;
  artifact_key: string;
  commit_sha: string;
  verdict: string;
  repo_path: string | null;
  verified_at: string;
}

interface PortfolioRow {
  kind: string;
  title: string;
  created_at: string;
}

const iso = (v: unknown): string => {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString();
};

/**
 * Build the registry for one project.
 *
 * NEVER THROWS for a missing source. A table that cannot be read becomes a WARNING on the
 * result, because a page that silently showed zero artifacts would be indistinguishable from a
 * project that has none, and this page exists precisely so that distinction is visible.
 */
export async function buildProjectArtifactRegistry(
  projectId: string,
): Promise<ProjectArtifactRegistry> {
  const warnings: string[] = [];

  const out: ProjectArtifactRegistry = {
    project_id: projectId,
    plan_version: null,
    verdict: 'no_plan',
    headline: '',
    required: [],
    outstanding_keys: [],
    existing: [],
    unclassified: [],
    malformed: [],
    counts: {
      stories_total: 0,
      stories_with_contract: 0,
      required: 0,
      satisfied: 0,
      outstanding: 0,
      existing: 0,
      unclassified: 0,
    },
    warnings,
  };

  // 1. WHAT IS REQUIRED.
  let stories: Array<{ id?: string; artifacts?: unknown }> = [];
  try {
    const stored = await getPublishedPlan(projectId);
    if (stored) {
      out.plan_version = stored.version;
      stories = (stored.plan?.stories ?? []) as Array<{ id?: string; artifacts?: unknown }>;
    }
  } catch (err: any) {
    warnings.push(`The published plan could not be read: ${err?.message || String(err)}. `
      + 'Nothing is claimed about what this project requires.');
  }
  out.counts.stories_total = stories.length;

  const resolvedByStory = new Map<string, ResolvedArtifact[]>();
  for (const story of stories) {
    const storyId = typeof story.id === 'string' ? story.id : '';
    if (!storyId) continue;
    if (story.artifacts === undefined || story.artifacts === null) continue;
    out.counts.stories_with_contract += 1;
    const v = validateArtifactContract(story.artifacts, { storyId });
    if (!v.ok) {
      out.malformed.push({ story_id: storyId, refusals: v.refusals.map((r) => r.code) });
      continue;
    }
    resolvedByStory.set(storyId, v.artifacts);
  }

  // 2. WHAT THE REPOSITORY CHECK SAW, and at which commit. Newest row per key wins.
  const seen = new Map<string, VerificationRow>();
  try {
    const rows = await sequelize.query<VerificationRow>(
      `SELECT story_id, artifact_key, commit_sha, verdict, repo_path, verified_at
         FROM story_artifact_verifications
        WHERE project_id = :projectId
        ORDER BY verified_at ASC`,
      { replacements: { projectId }, type: QueryTypes.SELECT },
    );
    for (const r of rows) seen.set(`${r.story_id}::${r.artifact_key}`, r);
  } catch (err: any) {
    warnings.push('The repository verification rows could not be read, so every required '
      + 'artifact below is shown as outstanding whether or not it exists: '
      + `${err?.message || String(err)}`);
  }

  for (const [storyId, artifacts] of resolvedByStory) {
    for (const a of artifacts) {
      const hit = seen.get(`${storyId}::${a.key}`);
      let state: RequiredArtifactState;
      if (hit) {
        state = hit.verdict === 'present_content_unchecked' ? 'present_content_unchecked' : 'satisfied';
      } else if (a.evidence_source !== 'repo') {
        state = 'not_repo_evidence';
      } else {
        state = 'missing';
      }
      out.required.push({
        story_id: storyId,
        key: a.key,
        name: a.name,
        type: a.type,
        evaluation_criteria: a.evaluation_criteria,
        repo_path: a.repo_path,
        state,
        commit_sha: hit ? hit.commit_sha : null,
        seen_at: hit ? iso(hit.verified_at) : null,
      });
    }
  }
  out.required.sort((x, y) => (x.story_id === y.story_id
    ? x.key.localeCompare(y.key)
    : x.story_id.localeCompare(y.story_id)));
  out.counts.required = out.required.length;
  out.counts.satisfied = out.required.filter(
    (r) => r.state === 'satisfied' || r.state === 'present_content_unchecked',
  ).length;
  out.outstanding_keys = out.required.filter((r) => r.state === 'missing').map((r) => r.key);
  out.counts.outstanding = out.outstanding_keys.length;

  // 3. WHAT EXISTS, whether or not anything asked for it.
  try {
    const rows = await sequelize.query<PortfolioRow>(
      `SELECT r.kind, r.title, r.created_at
         FROM runtime_portfolio_artifacts r
         JOIN projects p ON p.enrollment_id = r.enrollment_id
        WHERE p.id = :projectId
        ORDER BY r.created_at DESC`,
      { replacements: { projectId }, type: QueryTypes.SELECT },
    );
    for (const r of rows) {
      const mapped = catalogTypeForProductionKind(r.kind);
      const item: ExistingArtifact = {
        kind: r.kind,
        catalog_type: mapped ?? null,
        title: r.title,
        created_at: iso(r.created_at),
      };
      if (mapped) out.existing.push(item);
      else out.unclassified.push(item);
    }
  } catch (err: any) {
    warnings.push('What this project already holds could not be read, so the list of existing '
      + `artifacts below is not a statement that there are none: ${err?.message || String(err)}`);
  }
  out.counts.existing = out.existing.length;
  out.counts.unclassified = out.unclassified.length;

  out.verdict = verdictFor(out);
  out.headline = headlineFor(out);
  return out;
}

/** PURE. The verdict, kept separate so the distinction it draws is testable on its own. */
export function verdictFor(r: ProjectArtifactRegistry): RegistryVerdict {
  if (r.plan_version === null) return 'no_plan';
  if (r.counts.required === 0) return 'requires_nothing';
  return r.counts.outstanding > 0 ? 'outstanding' : 'all_satisfied';
}

/**
 * PURE. One sentence for the reader.
 *
 * `requires_nothing` must never read like compliance. "Nothing is outstanding" would be true and
 * useless for a project that promised nothing, and 0 of 67 plans carry a contract today, so that
 * is the sentence most readers would otherwise see.
 */
export function headlineFor(r: ProjectArtifactRegistry): string {
  const held = r.counts.existing + r.counts.unclassified;
  const holds = held === 1 ? 'Holds 1 artifact' : `Holds ${held} artifacts`;
  switch (verdictFor(r)) {
    case 'no_plan':
      return `${holds}. There is no published plan, so nothing is required of this project yet.`;
    case 'requires_nothing':
      return `${holds}, and its plan requires NONE of them. `
        + `${r.counts.stories_total} stories declare no artifact contract, so there is nothing to `
        + 'be missing: this is an absence of promises, not a clean record.';
    case 'outstanding':
      return `${holds}. ${r.counts.outstanding} of ${r.counts.required} required artifacts are `
        + `still owed: ${r.outstanding_keys.join(', ')}.`;
    default:
      return `${holds}. All ${r.counts.required} required artifacts have been handed over.`;
  }
}

/** The type's own criteria sentence, for a required row whose contract left it to the catalog. */
export function criteriaForType(type: string): string {
  const t = artifactType(type);
  return t ? t.evaluation_criteria : '';
}
