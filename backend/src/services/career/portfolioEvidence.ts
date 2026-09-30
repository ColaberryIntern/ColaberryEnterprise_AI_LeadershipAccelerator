/**
 * portfolioEvidence - the competency and evidence bands of the resume-format portfolio.
 *
 * WHY THIS IS SAFE TO PUBLISH, when a competency score was refused here before. The
 * refused number came from `student_architecture_skill`, derived from 8,895 rows that are
 * ALL `source='timeline'` - content opened, one row per band - with a constant proficiency
 * of 60.00. It measured attendance and called it assessment.
 *
 * These bands read `evidence_records` instead, and only rows with `validated = true`.
 * Audited against production on 2026-09-03: every one of Farhat Beig's 63 records is
 * validated, and they are `deliverable` (18), `instructor_review` (12), `implementation`
 * (12), `prompt_lab` (12) and `github_commit` (9). Not one consumption event. Each row is
 * something the learner DID, and each carries its own `competency_weights`, so a domain
 * score is a sum over real artefacts rather than a model's opinion.
 *
 * The published score is therefore defensible in the only way that matters here: for any
 * number on the page, you can name the artefacts underneath it.
 */

/** One competency domain, with the weight its evidence adds up to. */
export interface PublicCompetency {
  /** Stable id, e.g. `decision_making`. */
  domain: string;
  /** Human label, derived from the id - never invented. */
  label: string;
  score: number;
}

/** One class of evidence, counted. */
export interface PublicEvidenceSource {
  source_type: string;
  label: string;
  count: number;
}

/**
 * A source type's label. Anything unrecognised falls through to a humanised form of its
 * own id rather than to a guess, so a new source type appears honestly named instead of
 * being silently dropped or mislabelled.
 */
const SOURCE_LABELS: Record<string, string> = {
  deliverable: 'Deliverables submitted',
  github_commit: 'Commits',
  instructor_review: 'Instructor reviews',
  prompt_lab: 'Prompt labs',
  implementation: 'Implementations',
};

/** `decision_making` -> `Decision making`. Deterministic, and never a synonym. */
export function humanise(id: unknown): string {
  if (typeof id !== 'string' || !id.trim()) return '';
  const words = id.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MAX_COMPETENCIES = 12;

/**
 * The competency bands, highest first.
 *
 * Rows with a non-positive or unparseable score are dropped rather than rendered as an
 * empty bar. The list is capped, because nineteen bars is a wall rather than a summary -
 * `total_domains` on the caller's side can still state how many there are.
 */
export function normalizeCompetencies(raw: unknown): PublicCompetency[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicCompetency[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const domain = typeof r.domain === 'string' ? r.domain.trim() : '';
    if (!domain) continue;
    const score = Number(r.score);
    if (!Number.isFinite(score) || score <= 0) continue;
    out.push({ domain, label: humanise(domain), score: Math.round(score) });
  }
  out.sort((a, b) => (b.score - a.score) || a.domain.localeCompare(b.domain));
  return out.slice(0, MAX_COMPETENCIES);
}

/**
 * How many domains carry a real score, before the cap is applied.
 *
 * Travels alongside the capped list so the page can say "12 of 19" instead of implying
 * that twelve is the whole picture. Counts by the same rule the list filters by, so the
 * two can never disagree.
 */
export function countCompetencyDomains(raw: unknown): number {
  if (!Array.isArray(raw)) return 0;
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const domain = typeof r.domain === 'string' ? r.domain.trim() : '';
    const score = Number(r.score);
    if (domain && Number.isFinite(score) && score > 0) seen.add(domain);
  }
  return seen.size;
}

/** The evidence classes behind those bands, largest first. */
export function normalizeEvidenceSources(raw: unknown): PublicEvidenceSource[] {
  if (!Array.isArray(raw)) return [];
  const out: PublicEvidenceSource[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    const source_type = typeof r.source_type === 'string' ? r.source_type.trim() : '';
    if (!source_type) continue;
    const count = Number(r.count);
    if (!Number.isFinite(count) || count <= 0) continue;
    out.push({
      source_type,
      label: SOURCE_LABELS[source_type] || humanise(source_type),
      count: Math.round(count),
    });
  }
  out.sort((a, b) => (b.count - a.count) || a.source_type.localeCompare(b.source_type));
  return out;
}

/**
 * The capstone project, stated in numbers that came from the repository itself.
 *
 * Every field is nullable and a null renders no figure. Nothing here is inferred from
 * another field: a repo with no language recorded reports no language rather than
 * borrowing one from a sibling.
 */
export interface PublicFeaturedProject {
  name: string;
  repo_url: string | null;
  files: number | null;
  top_level_areas: number | null;
  capabilities: number | null;
  languages: number | null;
}

export interface FeaturedInput {
  name?: unknown;
  repoUrl?: unknown;
  files?: unknown;
  topLevelAreas?: unknown;
  capabilities?: unknown;
  languages?: unknown;
}

const positive = (v: unknown): number | null =>
  (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : null);

/**
 * The featured project, or null when there is no project to feature.
 *
 * A name is the minimum: a block of counts with nothing to call itself is not a project,
 * and rendering one would be the page claiming work it cannot name.
 */
export function composeFeatured(input: FeaturedInput): PublicFeaturedProject | null {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) return null;
  const repo = typeof input.repoUrl === 'string' ? input.repoUrl.trim() : '';
  return {
    name,
    repo_url: /^https:\/\/github\.com\//.test(repo) ? repo : null,
    files: positive(input.files),
    top_level_areas: positive(input.topLevelAreas),
    capabilities: positive(input.capabilities),
    languages: positive(input.languages),
  };
}
