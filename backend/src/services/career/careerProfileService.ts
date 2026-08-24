/**
 * careerProfileService — assembles the private Career Studio payload.
 *
 * Gate 1 (access state machine) + Gate 2 (person-level profile) + Gate 7
 * (composer) of the Living Career Portfolio plan.
 *
 * Three properties worth stating up front, because they are the ones that make
 * this safe rather than merely working:
 *
 * - **Person-level, not project-level.** The subject is an enrollment, and every
 *   adapter reads all of that person's evidence. "Portfolio remains tied to one
 *   Project" is a stop condition (plan §71).
 *
 * - **The resume prerequisite is enforced HERE, server-side.** A caller without a
 *   resume gets `state: 'needs_resume'` and no career data at all — not a full
 *   payload that the UI politely hides. Plan §39: "Enforce server-side
 *   authorization too. Do not rely only on UI hiding."
 *
 * - **Partial failure degrades a section, never the page.** Adapters are settled
 *   independently and a failed one reports itself in `degraded[]`. Plan §63
 *   requires failures be safe AND visible; silently returning an empty skills
 *   list because a query timed out would be neither.
 */
import {
  identityAdapter,
  skillAdapter,
  artifactAdapter,
  projectAdapter,
  githubAdapter,
  deliveryAdapter,
  type CareerIdentity,
  type CareerCapability,
  type CareerArtifact,
  type CareerProject,
  type CareerGithub,
} from './careerEvidenceAdapters';
import { computeReadiness, DEFAULT_POLICY, type ReadinessResult, type PortfolioReadinessPolicy } from './careerReadiness';

export type CareerAccessState = 'needs_resume' | 'ready';

const RECENT_WINDOW_DAYS = 7;

export interface CareerNarrative {
  /** The learner's OWN title, never a generated seniority claim. */
  headline: string | null;
  headline_source: 'profile_title' | 'not_set';
  /** Editable draft built only from counts that are true. */
  suggested_about: string | null;
  facts: string[];
}

export interface CareerRecentActivity {
  window_days: number;
  new_artifacts: number;
  capabilities_advanced: number;
  items: Array<{ kind: 'artifact' | 'capability'; label: string; at: string }>;
}

export interface CareerProfileResponse {
  state: CareerAccessState;
  visibility: 'private';
  identity: CareerIdentity | null;
  capabilities: CareerCapability[];
  artifacts: CareerArtifact[];
  projects: CareerProject[];
  github: CareerGithub | null;
  delivery_experience: unknown[];
  readiness: ReadinessResult | null;
  narrative: CareerNarrative | null;
  recent_activity: CareerRecentActivity | null;
  publication: { status: 'not_published'; note: string };
  /** Sections whose source failed. Empty on a healthy read. */
  degraded: string[];
  generated_at: string;
}

const NOT_PUBLISHED_NOTE =
  'Your portfolio is private. Publishing is reviewed and approved by a mentor, and is not yet available.';

function notFound(message: string): Error {
  return Object.assign(new Error(message), { error_class: 'NotFoundError', status: 404 });
}

/**
 * Deterministic composer (Gate 7).
 *
 * NO LLM. Plan §45 constrains generated copy to be evidence-grounded with no
 * invented metrics, roles or contribution, and §21 requires an AI quality review
 * before generated claims are trusted — a review gate that does not exist yet.
 * Until it does, the honest implementation is one that CANNOT invent: every
 * sentence below is either the learner's own profile text or a count taken
 * straight from the ledger.
 *
 * Note what is deliberately absent: no "Senior", no "Led", no "Architected", no
 * percentage, no business outcome. Plan §10 — a repo containing React proves
 * React evidence, not "Senior React Engineer".
 */
export function composeNarrative(
  identity: CareerIdentity,
  capabilities: CareerCapability[],
  artifacts: CareerArtifact[],
  projects: CareerProject[],
): CareerNarrative {
  const verified = capabilities.filter(
    (c) => c.evidence_level === 'colaberry_verified' || c.evidence_level === 'delivery_verified',
  );

  const facts: string[] = [];
  if (verified.length) facts.push(`${verified.length} Colaberry-verified capabilit${verified.length === 1 ? 'y' : 'ies'}`);
  if (artifacts.length) facts.push(`${artifacts.length} build artifact${artifacts.length === 1 ? '' : 's'}`);
  if (projects.length) facts.push(`${projects.length} project${projects.length === 1 ? '' : 's'}`);

  const headline = identity.title?.trim() || null;

  let suggested_about: string | null = null;
  if (facts.length) {
    const who = headline
      ? `${identity.full_name} — ${headline}`
      : identity.full_name;
    const where = identity.company?.trim() ? ` at ${identity.company.trim()}` : '';
    const top = verified
      .slice()
      .sort((a, b) => b.proficiency - a.proficiency)
      .slice(0, 3)
      .map((c) => c.name);
    const strengths = top.length ? ` Strongest evidence so far: ${top.join(', ')}.` : '';
    suggested_about = `${who}${where}. Evidence on file: ${facts.join(', ')}.${strengths}`;
  }

  return {
    headline,
    headline_source: headline ? 'profile_title' : 'not_set',
    suggested_about,
    facts,
  };
}

/** "What changed" feed (plan §19) — makes portfolio growth visible. */
export function computeRecentActivity(
  capabilities: CareerCapability[],
  artifacts: CareerArtifact[],
  now: Date = new Date(),
): CareerRecentActivity {
  const cutoff = new Date(now.getTime() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const newArtifacts = artifacts.filter((a) => a.created_at && a.created_at >= cutoff);
  const advanced = capabilities.filter((c) => c.last_demonstrated_at && c.last_demonstrated_at >= cutoff);

  const items = [
    ...newArtifacts.map((a) => ({ kind: 'artifact' as const, label: a.title, at: a.created_at as string })),
    ...advanced.map((c) => ({ kind: 'capability' as const, label: c.name, at: c.last_demonstrated_at as string })),
  ]
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 12);

  return {
    window_days: RECENT_WINDOW_DAYS,
    new_artifacts: newArtifacts.length,
    capabilities_advanced: advanced.length,
    items,
  };
}

/** Settle an adapter, recording its section in `degraded` if it throws. */
async function section<T>(name: string, run: () => Promise<T>, fallback: T, degraded: string[]): Promise<T> {
  try {
    return await run();
  } catch (err: any) {
    degraded.push(name);
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'career_profile_section_failed',
      error_class: err?.name || 'Error',
      outcome: 'partial',
      context: { section: name, message: err?.message },
    }));
    return fallback;
  }
}

export async function getCareerProfile(
  enrollmentId: string,
  policy: PortfolioReadinessPolicy = DEFAULT_POLICY,
): Promise<CareerProfileResponse> {
  const degraded: string[] = [];
  const generated_at = new Date().toISOString();

  const identity = await identityAdapter(enrollmentId);
  if (!identity) throw notFound('Career profile not found');

  const base = {
    visibility: 'private' as const,
    identity,
    publication: { status: 'not_published' as const, note: NOT_PUBLISHED_NOTE },
    generated_at,
  };

  // GATE 1 — the resume prerequisite. Returns BEFORE any evidence is assembled,
  // so a direct API call without a resume yields no skills, artifacts, projects
  // or repos. This is the security boundary, not the UI.
  if (!identity.resume) {
    return {
      ...base,
      state: 'needs_resume',
      capabilities: [],
      artifacts: [],
      projects: [],
      github: null,
      delivery_experience: [],
      readiness: null,
      narrative: null,
      recent_activity: null,
      degraded,
    };
  }

  const [capabilities, artifacts, projects, github, delivery_experience] = await Promise.all([
    section('capabilities', () => skillAdapter(enrollmentId), [] as CareerCapability[], degraded),
    section('artifacts', () => artifactAdapter(enrollmentId), [] as CareerArtifact[], degraded),
    section('projects', () => projectAdapter(enrollmentId), [] as CareerProject[], degraded),
    section('github', () => githubAdapter(enrollmentId), { repos: [], activity: null } as CareerGithub, degraded),
    section('delivery', () => deliveryAdapter(enrollmentId), [] as never[], degraded),
  ]);

  return {
    ...base,
    state: 'ready',
    capabilities,
    artifacts,
    projects,
    github,
    delivery_experience,
    readiness: computeReadiness({ identity, capabilities, artifacts, projects, github }, policy),
    narrative: composeNarrative(identity, capabilities, artifacts, projects),
    recent_activity: computeRecentActivity(capabilities, artifacts),
    degraded,
  };
}
