/**
 * careerEvidenceAdapters — read-only projections over the systems that already
 * own career evidence. Gate 3 of the Living Career Portfolio plan.
 *
 * THE RULE THIS FILE EXISTS TO ENFORCE: the Career Studio owns no data. Every
 * adapter below reads a system that already owns its truth and returns a typed
 * projection. Nothing here writes, and nothing here caches. Duplicating resume
 * truth, skill evidence, or XP into a second store is an explicit stop condition
 * of the build plan (§71), and the cheapest way to never violate it is to have
 * no store to violate it with.
 *
 * See docs/architecture/career-portfolio/CAREER_EVIDENCE_MAP.md for the
 * source-by-source mapping and why CAPE — not a new graph — is the evidence
 * spine.
 */
import { fn, col, Op } from 'sequelize';
import StudentSkillEvidence from '../../models/StudentSkillEvidence';
import StudentArchitectureSkill from '../../models/StudentArchitectureSkill';
import Project from '../../models/Project';
import GitHubConnection from '../../models/GitHubConnection';
import StudentGithubActivity from '../../models/StudentGithubActivity';
import { getLearnerSkillProfile } from '../cape/capeProficiencyService';
import { listArtifacts } from '../runtime/portfolioService';
import { getSettings } from '../portalSettingsService';

// ── Contracts ───────────────────────────────────────────────────────────────

/**
 * The three evidence levels of build plan §9. DERIVED at read time from CAPE
 * bands — deliberately not a stored column, so it can never drift from the
 * ledger it summarises.
 */
export type CareerEvidenceLevel = 'resume' | 'colaberry_verified' | 'delivery_verified';

export interface CareerIdentity {
  full_name: string;
  email: string;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  avatar_data_url: string | null;
  cohort_name: string | null;
  member_since: string | null;
  /** Presence + filename only. Resume CONTENT is never projected (privacy map). */
  resume: { file_name: string; uploaded_at: string | null } | null;
}

export interface CareerCapability {
  skill_id: string;
  name: string;
  evidence_level: CareerEvidenceLevel;
  proficiency: number;
  confidence: number;
  /** Per-band scores, so the UI can show WHY a level was assigned. */
  bands: { claim: number; knowledge: number; application: number; judgment: number };
  evidence_count: number;
  last_demonstrated_at: string | null;
  /** `{ source → count }` from the append-only ledger — plan §10 source_breakdown. */
  source_breakdown: Record<string, number>;
}

export interface CareerArtifact {
  id: string;
  kind: string;
  title: string;
  summary: string | null;
  competencies: string[];
  created_at: string | null;
}

export interface CareerProject {
  id: string;
  name: string;
  organization_name: string | null;
  industry: string | null;
  business_problem: string | null;
  stage: string | null;
  github_repo_url: string | null;
  maturity_score: number | null;
  created_at: string | null;
}

export interface CareerRepo {
  repo_url: string;
  repo_owner: string;
  repo_name: string;
  language: string | null;
  file_count: number | null;
  last_sync_at: string | null;
}

export interface CareerGithub {
  repos: CareerRepo[];
  activity: {
    commits_last_7d: number;
    open_prs: number;
    total_stars: number;
    synced_at: string | null;
  } | null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Normalise every timestamp to a real ISO-8601 UTC string.
 *
 * Strings are re-parsed rather than passed through, which matters more than it
 * looks: `computeRecentActivity` compares these timestamps LEXICOGRAPHICALLY
 * against a cutoff, and that is only sound if every value shares one format. A
 * raw aggregate (`MAX(created_at)` under `raw: true`) can arrive as a driver
 * string rather than a Date, and a Postgres-style `2026-08-20 12:00:00+00`
 * sorts differently from `2026-08-20T12:00:00.000Z`. Parsing first removes that
 * whole class of quiet wrongness.
 */
const iso = (d: unknown): string | null => {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString();
  if (typeof d === 'string') {
    const parsed = new Date(d);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
};

/**
 * Build plan §9 / §57. A capability is only "Colaberry Verified" when the
 * platform actually watched the learner do something — the knowledge,
 * application or judgment bands. A resume claim alone stays `resume` forever, no
 * matter how confident the extractor was, because the platform did not witness
 * it and must not vouch for it.
 *
 * `delivery_verified` is reachable in this contract but unreachable in practice:
 * the Refactored Experience Ledger does not exist on main, so no source can
 * currently produce it. See REFACTORED_INTEGRATION_MAP.md — modelling the level
 * now and resolving it to nothing is safer than either omitting it (widening a
 * shipped type later) or faking it from internship-tagged classwork (asserting
 * client delivery that never happened).
 */
export function deriveEvidenceLevel(bands: {
  claim: number;
  knowledge: number;
  application: number;
  judgment: number;
}): CareerEvidenceLevel {
  if (bands.knowledge > 0 || bands.application > 0 || bands.judgment > 0) {
    return 'colaberry_verified';
  }
  return 'resume';
}

// ── Adapters ────────────────────────────────────────────────────────────────

/** Exported for unit test only — `iso` itself stays module-private. */
export const __isoForTest = iso;

/** Identity — reads `portalSettingsService`, the existing owner of profile truth. */
export async function identityAdapter(enrollmentId: string): Promise<CareerIdentity | null> {
  const s = await getSettings(enrollmentId);
  if (!s) return null;
  return {
    full_name: s.account.full_name,
    email: s.account.email,
    title: s.profile.title,
    company: s.profile.company,
    linkedin_url: s.profile.linkedin_url,
    avatar_data_url: s.avatar_data_url,
    cohort_name: s.account.cohort_name,
    member_since: iso(s.account.member_since),
    resume: s.resume
      ? { file_name: s.resume.file_name, uploaded_at: iso(s.resume.uploaded_at) }
      : null,
  };
}

/**
 * Capabilities — CAPE is the evidence graph, so this adapter composes two reads
 * rather than recomputing anything:
 *   1. `getLearnerSkillProfile` (which itself refreshes any stale cache row), and
 *   2. one grouped aggregate over the append-only ledger for the provenance
 *      fields the profile shape does not carry (count, last-at, per-source).
 *
 * The aggregate is grouped in SQL rather than pulled row-by-row so a learner
 * with a long evidence history costs one round trip, not N.
 */
export async function skillAdapter(enrollmentId: string): Promise<CareerCapability[]> {
  const profile = await getLearnerSkillProfile(enrollmentId);
  if (!profile.skills.length) return [];

  const [breakdownRows, cacheRows] = await Promise.all([
    StudentSkillEvidence.findAll({
      where: { enrollment_id: enrollmentId },
      attributes: [
        'skill_id',
        'source',
        [fn('COUNT', col('id')), 'n'],
        [fn('MAX', col('created_at')), 'last_at'],
      ],
      group: ['skill_id', 'source'],
      raw: true,
    }) as unknown as Promise<Array<{ skill_id: string; source: string; n: string; last_at: Date | string }>>,
    StudentArchitectureSkill.findAll({
      where: { enrollment_id: enrollmentId },
      attributes: ['skill_id', 'evidence_count', 'last_evidence_at'],
      raw: true,
    }) as unknown as Promise<Array<{ skill_id: string; evidence_count: number; last_evidence_at: Date | null }>>,
  ]);

  const bySkill = new Map<string, { sources: Record<string, number>; last: string | null }>();
  for (const r of breakdownRows) {
    const entry = bySkill.get(r.skill_id) || { sources: {}, last: null };
    entry.sources[r.source] = (entry.sources[r.source] || 0) + Number(r.n);
    const at = iso(r.last_at);
    if (at && (!entry.last || at > entry.last)) entry.last = at;
    bySkill.set(r.skill_id, entry);
  }
  const cacheBySkill = new Map(cacheRows.map((r) => [r.skill_id, r]));

  return profile.skills.map((s) => {
    const bands = {
      claim: s.claim,
      knowledge: s.knowledge,
      application: s.application,
      judgment: s.judgment,
    };
    const extra = bySkill.get(s.skill_id);
    const cached = cacheBySkill.get(s.skill_id);
    return {
      skill_id: s.skill_id,
      name: s.name,
      evidence_level: deriveEvidenceLevel(bands),
      proficiency: s.proficiency,
      confidence: s.confidence,
      bands,
      evidence_count: Number(cached?.evidence_count ?? 0),
      last_demonstrated_at: extra?.last ?? iso(cached?.last_evidence_at ?? null),
      source_breakdown: extra?.sources ?? {},
    };
  });
}

/** Build artifacts — reuses the runtime service's own reader, unchanged. */
export async function artifactAdapter(enrollmentId: string): Promise<CareerArtifact[]> {
  const rows = await listArtifacts(enrollmentId);
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    summary: r.summary ?? null,
    competencies: Array.isArray(r.competencies) ? r.competencies.map((c: any) => String(c)) : [],
    created_at: iso(r.created_at),
  }));
}

/**
 * Projects — ALL of the person's non-archived projects, not the single project
 * the legacy share link assumes. "Portfolio remains tied to one Project" is a
 * stop condition (plan §71); this query is where that is prevented.
 */
export async function projectAdapter(enrollmentId: string): Promise<CareerProject[]> {
  const rows = await Project.findAll({
    where: { enrollment_id: enrollmentId, archived_at: { [Op.is]: null } as any },
    order: [['created_at', 'DESC']],
    limit: 50,
  });
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    organization_name: p.organization_name || null,
    industry: p.industry || null,
    business_problem: p.primary_business_problem || null,
    stage: p.project_stage || null,
    github_repo_url: p.github_repo_url || null,
    maturity_score: p.maturity_score ?? null,
    created_at: iso(p.created_at),
  }));
}

/**
 * GitHub — connected repositories and the activity aggregate, surfaced as
 * evidence of connected work and NOT as portfolio projects. Plan §13: "a repo is
 * not automatically a portfolio project." Without eligibility state, exclusion
 * rules (forks/tutorials/empty/confidential) or contribution attribution — none
 * of which exist on main — promoting a repo to a project would be an unsupported
 * claim. See GITHUB_INTEGRATION_MAP.md.
 */
export async function githubAdapter(enrollmentId: string): Promise<CareerGithub> {
  const [conns, activity] = await Promise.all([
    GitHubConnection.findAll({
      where: { enrollment_id: enrollmentId },
      order: [['created_at', 'DESC']],
      limit: 50,
    }),
    StudentGithubActivity.findOne({ where: { enrollment_id: enrollmentId } }),
  ]);

  // One repo may be connected against several projects; the person-level view
  // wants distinct repositories.
  const seen = new Set<string>();
  const repos: CareerRepo[] = [];
  for (const c of conns) {
    const key = (c.repo_url || `${c.repo_owner}/${c.repo_name}`).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    repos.push({
      repo_url: c.repo_url,
      repo_owner: c.repo_owner,
      repo_name: c.repo_name,
      language: c.repo_language || null,
      file_count: c.file_count ?? null,
      last_sync_at: iso(c.last_sync_at),
    });
  }

  return {
    repos,
    activity: activity
      ? {
          commits_last_7d: activity.commits_last_7d ?? 0,
          open_prs: activity.open_prs ?? 0,
          total_stars: activity.total_stars ?? 0,
          synced_at: iso(activity.synced_at),
        }
      : null,
  };
}

/**
 * Delivery experience — Refactored / internship / client delivery.
 *
 * INTENTIONALLY EMPTY. No delivery ledger exists on `origin/main` (searched:
 * no DeliveryProject, DeliveryDecision, ExecutionRun or ClientAcceptance model).
 * This adapter is the single seam where that integration lands; when the ledger
 * ships, only this function changes and `delivery_verified` starts resolving.
 */
export async function deliveryAdapter(_enrollmentId: string): Promise<never[]> {
  return [];
}
