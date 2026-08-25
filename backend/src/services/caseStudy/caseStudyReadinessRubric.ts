/**
 * caseStudyReadinessRubric — spec §13's eight categories, their weights, and the
 * thirty checks that award their points.
 *
 * WHY IT IS ITS OWN FILE. The rubric and the scorer together run past
 * CLAUDE.md's 300-line soft target, and the same split already exists next door
 * (`caseStudySnapshotBuilder` + `caseStudySnapshotSections`) for the same
 * reason. The dependency runs ONE way — `caseStudyReadinessService.ts` imports
 * this, never the reverse — so the pair is acyclic by construction. Read the
 * service's header first: it carries the doctrine this file implements.
 *
 * PURE. Every function below is a total function of its argument. No clock, no
 * randomness, no I/O, no logging, no model import.
 *
 * NOT ONE CHECK READS `metricType`. Spec §13: a repo-verified technical proof
 * point is acceptable and a business ROI number is not required. See
 * `outcome.proof_point`.
 *
 * LEAF: type-only imports plus one runtime guard from `caseStudyGuards`.
 */
import { isPublishableSurfaceKey } from '../../types/caseStudyGuards';
import type {
  CaseStudyArtifactRef,
  CaseStudyContributor,
  CaseStudyIdentitySection,
  CaseStudyMetricEntry,
  CaseStudySnapshotContent,
  CaseStudySnapshotStatus,
  CaseStudyStatus,
  CaseStudySurfaceKey,
} from '../../types/caseStudy';

/* ────────────────────────────────────────────────── categories and weights ── */

export type CaseStudyReadinessCategory =
  | 'identity' | 'technical' | 'story' | 'artifacts'
  | 'evidence' | 'outcome' | 'consent' | 'publication';

/** Spec §13's order. A member added here without a weight is a compile error. */
export const CASE_STUDY_READINESS_CATEGORIES = [
  'identity', 'technical', 'story', 'artifacts',
  'evidence', 'outcome', 'consent', 'publication',
] as const;

export const CASE_STUDY_READINESS_WEIGHTS: Readonly<Record<CaseStudyReadinessCategory, number>> =
  Object.freeze({
    identity: 10, technical: 15, story: 15, artifacts: 10,
    evidence: 20, outcome: 15, consent: 10, publication: 5,
  });

export const CASE_STUDY_READINESS_CATEGORY_LABELS:
Readonly<Record<CaseStudyReadinessCategory, string>> = Object.freeze({
  identity: 'Identity', technical: 'Technical facts',
  story: 'Story completeness', artifacts: 'Artifacts/media',
  evidence: 'Evidence', outcome: 'Outcome/proof point',
  consent: 'Consent/privacy', publication: 'Publication setup',
});

/**
 * DERIVED, never written down as `100`. Summing the table is what makes
 * "adding a category without rebalancing fails the suite" true rather than
 * aspirational — a literal would keep agreeing with itself forever.
 */
export const CASE_STUDY_READINESS_MAX_SCORE: number = CASE_STUDY_READINESS_CATEGORIES
  .reduce((total, key) => total + CASE_STUDY_READINESS_WEIGHTS[key], 0);

/**
 * Descriptive bands, named for substance rather than permission. There is
 * deliberately no `publishable` band: this module does not decide that.
 */
export type CaseStudyReadinessBand = 'thin' | 'developing' | 'substantial';

export const CASE_STUDY_READINESS_BAND_FLOORS:
Readonly<Record<'developing' | 'substantial', number>> =
  Object.freeze({ developing: 45, substantial: 75 });

export const CASE_STUDY_READINESS_ADVISORY =
  'Readiness is advisory. It describes how complete this record is. It does not '
  + 'authorise publication: the publish gate is the only authority on that.';

/* ──────────────────────────────────────────────────────────── input shape ─── */

/** The `case_study_publications` fields readiness can see. Nothing else is scored. */
export interface CaseStudyReadinessPublicationSetup {
  readonly surfaceKey?: CaseStudySurfaceKey;
}

/**
 * A candidate/snapshot, never a database row. `content` is the same
 * `CaseStudySnapshotContent` the builder emits and the publish gate reads, so
 * readiness cannot drift from what will actually render.
 */
export interface CaseStudyReadinessInput {
  readonly content: CaseStudySnapshotContent;
  readonly status: CaseStudyStatus;
  readonly snapshotStatus?: CaseStudySnapshotStatus;
  readonly publication?: CaseStudyReadinessPublicationSetup;
}

/* ─────────────────────────────────────────────────────────────── helpers ──── */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VISUAL_ARTIFACTS = ['screenshot', 'architecture', 'demo'];

const filled = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0;
const many = <T>(v: readonly T[] | undefined): readonly T[] => (Array.isArray(v) ? v : []);

/** First matching `[threshold, award]` pair, highest threshold first. */
const step = (n: number, ...tiers: readonly (readonly [number, number])[]): number => {
  for (const [floor, award] of tiers) if (n >= floor) return award;
  return 0;
};

export const clampAward = (n: number, max: number): number =>
  (Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 0), max) : 0);

/* ─────────────────────────────────────────────────────────────── context ──── */

export interface ReadinessContext {
  readonly input: CaseStudyReadinessInput;
  readonly content: CaseStudySnapshotContent;
  readonly identity: CaseStudyIdentitySection;
  /** Hero metrics plus measurement metrics, deduped by key, hero winning. */
  readonly metrics: readonly CaseStudyMetricEntry[];
  /** What the hero band will actually render — see below. */
  readonly headline: readonly CaseStudyMetricEntry[];
  readonly approvedArtifacts: readonly CaseStudyArtifactRef[];
  readonly contributors: readonly CaseStudyContributor[];
}

export function buildReadinessContext(input: CaseStudyReadinessInput): ReadinessContext {
  const content = input.content;
  // Filtered FIRST, not while iterating: `headline` falls back to this list, and
  // a null smuggled in from JSONB must not reach a check that dereferences it.
  const hero = many(content.heroMetrics)
    .filter((m): m is CaseStudyMetricEntry => !!m && typeof m === 'object');
  const seen = new Set<string>();
  const metrics: CaseStudyMetricEntry[] = [];
  for (const m of [...hero, ...many(content.measurement?.metrics)]) {
    if (!m || typeof m !== 'object') continue;
    const key = filled(m.key) ? m.key : `#${metrics.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    metrics.push(m);
  }
  // A record whose builder never ticked `isHeadline` still shows `heroMetrics`
  // in the hero band, so readiness scores the page as it will actually render.
  const flagged = metrics.filter((m) => m.isHeadline === true);
  return {
    input,
    content,
    identity: content.identity,
    metrics,
    headline: flagged.length > 0 ? flagged : hero,
    approvedArtifacts: many(content.artifacts).filter((a) => a?.status === 'approved'),
    contributors: many(content.contributors),
  };
}

/**
 * The best award any metric earns for its verification class. `metricType` is
 * never read: a verified technical result and a verified business outcome are
 * worth the same, which is spec §13's allowance expressed as code. Self-reported
 * verification takes the weak award — a claim checked only by its author.
 */
function bestVerified(metrics: readonly CaseStudyMetricEntry[], strong: number, weak: number): number {
  let best = 0;
  for (const m of metrics) {
    const cls = m?.verification?.class;
    if (cls === 'verified') best = Math.max(best, m.verification?.method === 'self' ? weak : strong);
    else if (cls === 'anonymized') best = Math.max(best, weak);
  }
  return best;
}

/* ──────────────────────────────────────────────────────────────── checks ──── */

export interface ReadinessCheck {
  readonly key: string;
  readonly category: CaseStudyReadinessCategory;
  readonly points: number;
  readonly score: (c: ReadinessContext) => number;
  /** What is missing. Surfaced verbatim in the gap. */
  readonly detail: string;
  /** What would close it. Surfaced verbatim in the gap. */
  readonly remedy: string;
}

export const CASE_STUDY_READINESS_CHECKS: readonly ReadinessCheck[] = [
  /* Identity — 2 + 2 + 4 + 2 = 10 */
  { key: 'identity.slug', category: 'identity', points: 2,
    score: (c) => (SLUG.test(c.identity?.slug || '') ? 2 : 0),
    detail: 'the slug is missing or is not URL-safe',
    remedy: 'set a lowercase hyphenated slug; it is the /stories/:slug address' },
  { key: 'identity.title', category: 'identity', points: 2,
    score: (c) => (filled(c.identity?.title) ? 2 : 0),
    detail: 'the Case Study has no title',
    remedy: 'give it a title; the index card and the page heading both read it' },
  { key: 'identity.standfirst_and_summary', category: 'identity', points: 4,
    score: (c) => (filled(c.identity?.standfirst) ? 2 : 0) + (filled(c.identity?.summary) ? 2 : 0),
    detail: 'the hero is missing a standfirst, a summary, or both',
    remedy: 'write a one-sentence standfirst and a short summary; the card renders both' },
  { key: 'identity.attribution', category: 'identity', points: 2,
    score: (c) => (c.identity?.builtByType ? 2 : 0),
    detail: 'who built it is not recorded',
    remedy: 'set builtByType (learner, client team, joint team, ...) — spec §23 "who built it"' },

  /* Technical facts — 5 + 4 + 3 + 3 = 15 */
  { key: 'technical.stack', category: 'technical', points: 5,
    score: (c) => step(many(c.content.taxonomy?.stack).length, [3, 5], [1, 3]),
    detail: 'fewer than three stack entries are recorded',
    remedy: 'sync a repository, or record the technologies in taxonomy.stack' },
  { key: 'technical.capabilities', category: 'technical', points: 4,
    score: (c) => step(many(c.content.taxonomy?.capabilities).length, [2, 4], [1, 2]),
    detail: 'fewer than two capabilities are recorded',
    remedy: 'record what the system does in taxonomy.capabilities; the /stories filters read it' },
  { key: 'technical.architecture', category: 'technical', points: 3,
    score: (c) => (many(c.content.architecture?.stack).length > 0
      || many(c.content.architecture?.capabilities).length > 0 ? 3 : 0),
    detail: 'there is no architecture section',
    remedy: 'run a repository sync, or write the architecture section by hand' },
  { key: 'technical.repo_pinned', category: 'technical', points: 3,
    score: (c) => (many(c.content.repositories).some((r) => filled(r?.lastSeenSha)) ? 3 : 0),
    detail: 'no source repository is pinned to a commit',
    remedy: 'attach and sync a repository so the facts are pinned to a commit sha' },

  /* Story completeness — 5 + 4 + 3 + 3 = 15 */
  { key: 'story.situation', category: 'story', points: 5,
    score: (c) => step(many(c.content.situation?.narrative).length, [2, 5], [1, 3]),
    detail: 'the situation is missing or is a single line',
    remedy: 'describe the problem in at least two paragraphs of situation.narrative' },
  { key: 'story.timeline', category: 'story', points: 4,
    score: (c) => step(many(c.content.buildTimeline).length, [3, 4], [1, 2]),
    detail: 'the build timeline has fewer than three entries',
    remedy: 'sync repository history, or add milestones to buildTimeline' },
  { key: 'story.narrative_depth', category: 'story', points: 3,
    score: (c) => (many(c.content.architecture?.narrative).length > 0
      || many(c.content.measurement?.narrative).length > 0 ? 3 : 0),
    detail: 'neither the architecture nor the measurement section has narrative text',
    remedy: 'write the architecture or measurement narrative; facts alone do not read as a story' },
  { key: 'story.roadmap', category: 'story', points: 3,
    score: (c) => (many(c.content.roadmap).length > 0 ? 3 : 0),
    detail: 'there is no roadmap',
    remedy: 'record what happened next; paused and not_pursued are valid and often more credible' },

  /* Artifacts/media — 5 + 3 + 2 = 10 */
  { key: 'artifacts.approved', category: 'artifacts', points: 5,
    score: (c) => step(c.approvedArtifacts.length, [2, 5], [1, 3])
      || (many(c.content.artifacts).length > 0 ? 1 : 0),
    detail: 'fewer than two artifacts have been approved',
    remedy: 'review the candidate artifacts and approve the ones that may be shown' },
  { key: 'artifacts.public', category: 'artifacts', points: 3,
    score: (c) => Math.max(0, ...c.approvedArtifacts.map((a) => (a.visibility === 'public' ? 3
      : a.visibility === 'request_only' ? 1 : 0))),
    detail: 'no approved artifact is publicly viewable',
    remedy: 'mark an approved artifact public, or offer it as request_only' },
  { key: 'artifacts.visual', category: 'artifacts', points: 2,
    score: (c) => (c.approvedArtifacts.some((a) => VISUAL_ARTIFACTS.includes(a.artifactType)) ? 2 : 0),
    detail: 'there is no approved screenshot, architecture image or demo',
    remedy: 'approve a screenshot, diagram or demo; the detail page is text-only without one' },

  /* Evidence — 8 + 6 + 3 + 3 = 20 */
  { key: 'evidence.headline_linked', category: 'evidence', points: 8,
    score: (c) => (c.headline.length === 0 ? 0
      : Math.round((8 * c.headline.filter((m) => filled(m?.verification?.evidenceId)).length)
        / c.headline.length)),
    detail: 'no verified evidence is linked to the headline claim',
    remedy: 'link a case_study_evidence row to every headline metric (verification.evidenceId)' },
  { key: 'evidence.verified_claim', category: 'evidence', points: 6,
    score: (c) => bestVerified(c.metrics, 6, 3),
    detail: 'no claim is independently verified',
    remedy: 'verify a claim against a repository, the platform or the client; self-reported scores half' },
  { key: 'evidence.measurement_context', category: 'evidence', points: 3,
    score: (c) => Math.max(0, ...c.headline.map((m) => (!m?.measurement ? 0
      : filled(m.measurement.baseline) || filled(m.measurement.sample)
        || filled(m.measurement.methodology) ? 3 : 1))),
    detail: 'the headline claim carries no baseline, sample or methodology',
    remedy: 'record how it was measured; spec §23 will not render a big number without it' },
  { key: 'evidence.no_pending_publishable', category: 'evidence', points: 3,
    score: (c) => (c.metrics.length > 0 && !c.metrics.some((m) => m?.publishable === true
      && m.verification?.class === 'pending') ? 3 : 0),
    detail: 'there are no metrics, or a metric marked publishable is still pending',
    remedy: 'verify every publishable metric or clear its flag; the publish gate rejects pending' },

  /* Outcome/proof point — 9 + 3 + 3 = 15. No check here reads `metricType`. */
  { key: 'outcome.proof_point', category: 'outcome', points: 9,
    score: (c) => bestVerified(c.metrics, 9, 7),
    detail: 'there is no verified proof point',
    remedy: 'verify one proof point of any kind; a repo-verified technical result is enough (spec §13)' },
  { key: 'outcome.expressed', category: 'outcome', points: 3,
    score: (c) => (c.metrics.some((m) => filled(m?.valueDisplay)
      && (m.verification?.class === 'verified' || m.verification?.class === 'anonymized')) ? 3 : 0),
    detail: 'the verified proof point has nothing to display',
    remedy: 'give the verified metric a valueDisplay; never invent one to fill the card (spec §22)' },
  { key: 'outcome.what_happened_next', category: 'outcome', points: 3,
    score: (c) => (c.identity?.productionStatus?.status
      && c.identity.productionStatus.status !== 'unknown' ? 3
      : many(c.content.roadmap).some((r) => r?.status === 'shipped' || r?.status === 'in_progress')
        ? 3 : 0),
    detail: 'what happened to the work is unrecorded',
    remedy: 'set productionStatus, or record a shipped/in_progress roadmap item' },

  /* Consent/privacy — 4 + 3 + 2 + 1 = 10. The real gate, per spec §16. */
  { key: 'consent.organization', category: 'consent', points: 4,
    score: (c) => (c.identity?.organizationIdentityMode !== 'named'
      ? (c.identity?.organizationIdentityMode ? 4 : 0)
      : (c.identity.organizationNamingConsent === true
        && filled(c.identity.organizationDisplayName) ? 4 : 0)),
    detail: 'organization identity mode and naming consent do not agree',
    remedy: 'record naming consent and a display name, or set the mode to anonymized or hidden' },
  { key: 'consent.builder', category: 'consent', points: 3,
    score: (c) => (c.identity?.builderIdentityMode !== 'named'
      ? (c.identity?.builderIdentityMode ? 3 : 0)
      : (c.identity.builderNamingConsent === true ? 3 : 0)),
    detail: 'the builder is named but builder naming consent is not recorded',
    remedy: 'record builder naming consent, or set the mode to role_only or anonymous' },
  { key: 'consent.contributors', category: 'consent', points: 2,
    score: (c) => (c.contributors.every((p) => p?.displayMode !== 'named'
      || (filled(p.consentRecordedAt) && c.identity?.builderIdentityMode === 'named'
        && c.identity?.builderNamingConsent === true)) ? 2 : 0),
    detail: 'a contributor is named without a consent date, or against the builder identity mode',
    remedy: 'record consentRecordedAt for every named contributor, or switch them to role_only' },
  { key: 'consent.repo_links', category: 'consent', points: 1,
    score: (c) => (many(c.content.repositories)
      .every((r) => r?.allowPublicRepoLink !== true || r.visibility === 'public') ? 1 : 0),
    detail: 'a repository is flagged for a public link but is not public',
    remedy: 'clear allowPublicRepoLink on every private or unknown-visibility repository' },

  /* Publication setup — 2 + 1 + 1 + 1 = 5 */
  { key: 'publication.surface_declared', category: 'publication', points: 2,
    score: (c) => (c.input.publication?.surfaceKey ? 2 : 0),
    detail: 'no target surface is declared',
    remedy: 'create the publication row and choose its surface' },
  { key: 'publication.surface_publishable', category: 'publication', points: 1,
    score: (c) => (isPublishableSurfaceKey(c.input.publication?.surfaceKey) ? 1 : 0),
    detail: 'the declared surface is not publishable in Phase 1',
    remedy: 'target the enterprise surface; the other three are contract-only for now' },
  { key: 'publication.snapshot_approved', category: 'publication', points: 1,
    score: (c) => (c.input.snapshotStatus === 'approved' ? 1 : 0),
    detail: 'no approved snapshot exists',
    remedy: 'review the draft snapshot and approve it' },
  { key: 'publication.record_approved', category: 'publication', points: 1,
    score: (c) => (c.input.status === 'approved' || c.input.status === 'published' ? 1 : 0),
    detail: 'the Case Study record is not approved',
    remedy: 'move the Case Study to approved once review is complete' },
];

/** Structural projection: the rubric legend, without the scoring functions. */
export const CASE_STUDY_READINESS_CHECK_POINTS: readonly {
  readonly key: string;
  readonly category: CaseStudyReadinessCategory;
  readonly points: number;
}[] = Object.freeze(CASE_STUDY_READINESS_CHECKS.map((c) => Object.freeze({
  key: c.key, category: c.category, points: c.points,
})));
