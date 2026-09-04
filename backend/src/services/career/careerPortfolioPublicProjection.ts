/**
 * careerPortfolioPublicProjection - THE SECURITY BOUNDARY of the public portfolio.
 *
 * Everything `/api/public/portfolios/:slug` ever returns is built here, field by named field,
 * from object literals whose shapes are declared below. There is no spread of an
 * internal object anywhere in this file: no `...profile`, no `Object.assign`, no
 * `JSON.parse(JSON.stringify(row))`. An internal field reaches the public payload only
 * when a human types its name into one of these literals, and the test beside this file
 * is watching for exactly that.
 *
 * MODELLED ON `caseStudy/caseStudyPublicProjection.ts`, deliberately. That file states
 * the rule this one obeys: a deny-list is wrong by default, because the field added next
 * month is not on it. An allow-list is right by default, because the field added next
 * month is absent until somebody adds it here on purpose.
 *
 * `identity.email` USED TO BE REFUSED HERE, and came off that list deliberately on
 * 2026-09-03, on Ali's explicit decision. The argument that moved it: this page exists so
 * that a recruiter can act on it, an email address is the thing they act with, and the
 * learner approves the page before it publishes. It is the ONE contact detail that
 * crosses, and it crosses validated - see `emailOrNull` below. The phone number and the
 * street address stay refused; neither is needed to offer somebody a job.
 *
 * WHAT THE PRIVATE PROFILE CARRIES THAT MUST NEVER CROSS. `CareerProfileResponse` is
 * built for the learner's own eyes and holds, among other things:
 *
 *   identity.phone                 a personal number, and not what a recruiter needs
 *   identity.resume.file_name      a filename is not neutral; people name these badly
 *   capability.bands               per-band scores. Publishing `judgment: 0.2` next to
 *                                  someone's name damages them; the portal shows it to
 *                                  explain a level to its owner, not to rank them
 *   capability.confidence          internal model score
 *   capability.proficiency         internal model score
 *   capability.source_breakdown    ledger internals
 *   github.activity                `commits_last_7d` reads as productivity. A learner on
 *                                  holiday publishes a zero, which is a lie about them
 *   readiness.blocking             THE LIST OF WHAT THEY ARE MISSING. The single worst
 *                                  field to show a hiring manager, and the whole reason
 *                                  a filtered snapshot was never acceptable here
 *
 * None of those have a shape to occupy in the types below.
 *
 * UNVERIFIED CAPABILITIES ARE STRUCTURALLY UNPUBLISHABLE. `PublicCapability.evidence_level`
 * is `CareerVerifiedLevel`, which has no `'none'` and no `'resume'` member, so an
 * unverified capability cannot be represented even if the filter below were wrong. A
 * claim reaches this page because the ledger supports it or it does not reach it.
 *
 * A PRIVATE REPOSITORY IS DROPPED, NOT BLANKED. `PublicRepository` has no visibility
 * field and no owner, so a private repo cannot be rendered "without its URL". It
 * survives only as one increment of `private_repository_count`, which is the honest
 * statement (there was more work behind this) without the identity.
 *
 * PURE. No model, no Express, no `fetch`, no `Date.now()` - `generated_at` is passed in.
 * Given the same profile it returns the same payload forever, which is what lets a
 * reviewer preview show exactly what the public page will show.
 *
 * FAILURE-FIRST. (1) A malformed section cannot throw: every read is defensive and
 * anything unreadable is DROPPED rather than rendered, so bad data degrades to a shorter
 * page and never to a leak or a 500. (2) No retry - there is no I/O. (3) Recovery: fix
 * the profile and re-approve. (4) Handled: absent identity, null capability list, junk
 * levels, non-http URLs, records that are not published. Not handled: nothing - there is
 * no failure mode left that reaches the caller.
 */
import {
  normalizeExperience, normalizeEducation,
} from '../resumeHistory';
import type { ResumeExperience, ResumeEducation } from '../resumeHistory';
import { composeAbout, composeStats, type PortfolioStats } from './portfolioOverview';
import {
  normalizeCompetencies, normalizeEvidenceSources, composeFeatured, countCompetencyDomains,
  type PublicCompetency, type PublicEvidenceSource, type PublicFeaturedProject,
} from './portfolioEvidence';



// ── The public shapes. This is the entire contract. ────────────────────────

export interface PublicIdentity {
  full_name: string;
  headline: string | null;
  cohort_name: string | null;
  avatar_data_url: string | null;
  linkedin_url: string | null;
  /** Published on purpose, and validated - see the note at the top of this file. */
  email: string | null;
  /** City / region as the resume stated it. NEVER a street address. */
  location: string | null;
  /** Derived from a repository we can see, never guessed from a name. */
  github_url: string | null;
}

/**
 * An address shaped like an address, or null.
 *
 * Deliberately narrower than RFC-complete: this value is rendered into a `mailto:` on a
 * public page, so anything carrying whitespace, a comma, a quote or angle brackets is
 * refused outright rather than escaped and hoped over.
 */
function emailOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t || t.length > 254) return null;
  return /^[^\s<>,;:"'()[\]\\]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(t) ? t : null;
}

/**
 * A city or region, or null.
 *
 * A street address is not wanted here and mostly announces itself by carrying a house
 * number, so a leading digit is refused. Imperfect, and deliberately erring toward
 * publishing nothing rather than publishing where somebody lives.
 */
function placeOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (!t || t.length > 120) return null;
  if (/^\d/.test(t)) return null;
  return t;
}

/**
 * A capability, PROVEN BY COMMITTED FILES.
 *
 * WHAT THIS REPLACED, AND WHY IT HAD TO GO. This band was previously fed from
 * `student_architecture_skill`, and rendered as "Verified by Colaberry - 240 pieces of
 * evidence". Audited 2026-08-31: **every one of the platform's 8,895 evidence rows across
 * 73 learners has `source = 'timeline'`** - curriculum content opened - and a single item
 * writes one row PER BAND, so the counts multiply. `proficiency` is a constant 60.00 and
 * `confidence` a constant 1.000. That is attendance data wearing the language of
 * assessment, and publishing it to a recruiter as proof was the most damaging claim on
 * the page.
 *
 * The repo file tree is the only stream a student demonstrably earned, so it is the only
 * one this band now carries. There is no `evidence_count` here on purpose: a number that
 * cannot be defended should not be printed next to someone's name.
 */
export interface PublicCapability {
  /** The capability's own label, e.g. "Agent Skills". */
  name: string;
  /** Distinct immediate children for a collection; 1 for a single artefact. */
  count: number;
  /** A service whose run was evidenced. Emitted only when true - absence is not denial. */
  proven?: boolean;
  /** Built against the provided sample rather than their own system. */
  on_sample?: boolean;
}

/**
 * A role from the learner's own resume.
 *
 * WHY EMPLOYMENT HISTORY IS ALLOWED TO CROSS, when `email` and `resume.file_name`
 * are not. The refusals above are things the learner never chose to publish - a
 * contact detail, an internal score, a filename they typed for themselves. An
 * employment history is the opposite: it is the part of a resume whose whole
 * purpose is to be read by a stranger deciding whether to hire, and the learner
 * approves this page before it publishes. Without it the page reads as a bootcamp
 * exercise rather than a professional's body of work.
 *
 * What still does NOT cross from the resume: the file, its name, the raw text, the
 * phone number, the street address. Only these named fields do.
 */
export type PublicExperience = ResumeExperience;
export type PublicEducation = ResumeEducation;

export interface PublicRecord {
  slug: string;
  title: string;
  published_at: string | null;
}

/**
 * A project, as a stranger may see it.
 *
 * WHAT THE `projects` ROW CARRIES THAT MUST NOT CROSS, and why each is refused:
 *
 *   share_token                a LIVE ACCESS CREDENTIAL. Publishing it would hand every
 *                              reader the private share link.
 *   maturity_score             20 out of 100 printed beside someone's name is a grade,
 *   health_score               not a portfolio. Same class as `capability.bands`: the
 *   velocity_score             portal shows these to their owner to guide them, never to
 *   stability_score            rank them in front of an employer.
 *   requirements_completion_pct
 *   readiness_score_breakdown
 *   claude_md_content          internal build instructions
 *   requirements_document      internal working document
 *   project_variables          internal config, may name systems and credentials
 *   data_sources               may name internal systems
 *   executive_summary          already published, in full, on the record page
 *
 * None have a shape to occupy below.
 */
export interface PublicProject {
  title: string;
  organization: string | null;
  industry: string | null;
  problem: string | null;
  automation_goal: string | null;
  stage: string | null;
  repo_url: string | null;
  demo_url: string | null;
  /**
   * An image committed to the project's own PUBLIC repository, or null.
   *
   * Resolved at review time and frozen with the rest of the learner-authored text,
   * so this is a plain URL by the time it reaches here. `httpUrl` still gates it:
   * the freeze blob is data at rest and this is the last point before a stranger's
   * browser is told to fetch it.
   */
  hero_image_url: string | null;
  /**
   * The slug of the capstone record written about THIS project, or null.
   *
   * Ali: "I should be able to drill into the projects and get a similar Case study."
   * The write-ups already existed but lived in a separate list, so a reader could see
   * that a person had written something and not which project it was about.
   *
   * A SLUG AND NOT AN ID. `capstone_records.project_id` does the joining server-side;
   * what crosses is the public address of a page a stranger may already open. Only
   * PUBLISHED, non-private records are ever passed in, so a draft write-up cannot
   * become a link here however this field is read.
   */
  record_slug: string | null;
}

export interface PublicRepository {
  name: string;
  url: string;
}

export interface PublicPortfolio {
  identity: PublicIdentity;
  /** Deterministically composed paragraphs. Empty when there is nothing to say. */
  about: string[];
  stats: PortfolioStats;
  /** The capstone, stated in numbers taken from the repository itself. */
  featured: PublicFeaturedProject | null;
  /** Competency bands, from VALIDATED evidence only. Capped; see below. */
  competencies: PublicCompetency[];
  /** How many domains exist in total, so a capped list can still say so honestly. */
  competency_domain_count: number;
  /** The classes of evidence those bands are summed from. */
  evidence_by_source: PublicEvidenceSource[];
  /** Most recent FIRST. Empty when no resume was ever ingested. */
  experience: PublicExperience[];
  education: PublicEducation[];
  capabilities: PublicCapability[];
  projects: PublicProject[];
  records: PublicRecord[];
  repositories: PublicRepository[];
  /** Work that exists behind a private repo, stated as a count and nothing more. */
  private_repository_count: number;
  generated_at: string;
}

// ── Defensive readers. Anything unreadable is dropped, never rendered. ─────

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() !== '' ? v.trim() : null;

const count = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

/**
 * Only `http:` and `https:` survive. A `javascript:` or `data:` URL reaching an
 * unauthenticated page is a scripting vector, and this content is student-authored.
 */
function httpUrl(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * A record's title, and NEVER its slug.
 *
 * `ali-muwwakkil` rendered as a project title on Ali's own live page, because
 * `system.project_name` was null and the fallback was the slug. A URL fragment presented
 * as the name of someone's work reads as broken software to the hiring manager it is
 * shown to.
 *
 * The fallback chain uses only REAL data, never an invented name:
 *   1. `project_name` as compiled
 *   2. the descriptor's own first heading -- the document titled itself
 *   3. "Untitled record" -- honest, and still a working link
 */
function recordTitle(r: any): string {
  const named = str(r.title) ?? str(r.project_name);
  if (named) return named;

  const descriptor = str(r.descriptor);
  if (descriptor) {
    for (const line of descriptor.split('\n')) {
      const m = /^\s{0,3}#{1,3}\s+(.+?)\s*#*\s*$/.exec(line);
      // Strip inline emphasis so a heading like `# **Strategy**` does not keep its stars.
      if (m) {
        const heading = m[1].replace(/[*_`]/g, '').trim();
        if (heading) return heading.slice(0, 160);
      }
    }
  }
  return 'Untitled record';
}

// ── The projection. ───────────────────────────────────────────────────────

export interface ProjectPortfolioInput {
  profile: unknown;
  /** Rows from `projects`. Learner-authored, so the caller passes the APPROVED set. */
  projects?: unknown;
  /** Repo-observed capabilities, already merged by the caller. */
  capabilities?: unknown;
  /** Already-PUBLISHED capstone records. An unpublished record is not passed in. */
  records: unknown;
  /** Files committed across the repositories the platform can see. */
  filesCommitted?: number | null;
  /**
   * Rows in `evidence_records` - deliverables, commits, prompt labs, implementations and
   * instructor reviews. NOT the discredited `student_skill_evidence` count; see
   * portfolioOverview.ts for the audit that separates the two.
   */
  evidenceRecords?: number | null;
  /** The capstone project's name and descriptor, for the About paragraph. */
  projectName?: string | null;
  projectDescriptor?: string | null;
  /** `{domain, score}` rows summed from VALIDATED evidence_records only. */
  competencies?: unknown;
  /** `{source_type, count}` rows over the same validated set. */
  evidenceBySource?: unknown;
  /** Repository-derived counts for the featured project block. */
  featuredRepoUrl?: string | null;
  featuredTopLevelAreas?: number | null;
  featuredLanguages?: number | null;
  /**
   * `OnboardingProfile.extracted` - raw LLM output from the resume ingest. Passed
   * in raw ON PURPOSE: normalization is this module's job, so there is exactly one
   * place that decides what a stranger may read.
   */
  resume?: unknown;
  generatedAt: string;
}

export function projectPublicPortfolio(input: ProjectPortfolioInput): PublicPortfolio {
  const profile: any = input.profile ?? {};
  const id: any = profile.identity ?? {};

  const identity: PublicIdentity = {
    full_name: str(id.full_name) ?? 'Unnamed',
    // The learner's own title. `email`, `company` and `resume` are absent by design.
    headline: str(id.title),
    cohort_name: str(id.cohort_name),
    avatar_data_url: str(id.avatar_data_url),
    linkedin_url: httpUrl(id.linkedin_url),
    email: emailOrNull(id.email),
    location: placeOrNull(id.location),
    github_url: null, // resolved below, once the repository list is known
  };

  // Fed from the REPO, not from the assessment tables. See PublicCapability above.
  const rawCaps: any[] = Array.isArray(input.capabilities) ? input.capabilities : [];
  const capabilities: PublicCapability[] = rawCaps
    .filter((c) => c && typeof c === 'object' && c.present === true && str(c.label ?? c.id))
    .map((c) => ({
      name: str(c.label) ?? str(c.id)!,
      count: typeof c.count === 'number' && c.count > 0 ? Math.floor(c.count) : 1,
      ...(c.proven === true ? { proven: true } : {}),
      ...(c.onSample === true ? { on_sample: true } : {}),
    }))
    .sort((a, b2) => a.name.localeCompare(b2.name));

  // Which project each PUBLISHED write-up is about. Built before the projects are mapped
  // so a card can carry its own record's address; `records` only ever contains published,
  // non-private rows, so nothing draft can reach this map.
  const recordSlugByProject = new Map<string, string>();
  for (const r of (Array.isArray(input.records) ? input.records : []) as any[]) {
    const pid = str(r?.project_id);
    const slug = str(r?.slug);
    if (pid && slug && !recordSlugByProject.has(pid)) recordSlugByProject.set(pid, slug);
  }

  const rawProjects: any[] = Array.isArray(input.projects) ? input.projects : [];
  const projects: PublicProject[] = rawProjects
    .filter((p) => p && typeof p === 'object')
    // A project with no name AND no use case has nothing to call itself; a row that
    // cannot be titled is an abandoned intake, not a portfolio entry.
    .map((p) => ({
      title: str(p.name) ?? str(p.selected_use_case) ?? '',
      organization: str(p.organization_name),
      industry: str(p.industry),
      problem: str(p.primary_business_problem),
      automation_goal: str(p.automation_goal),
      stage: str(p.project_stage),
      repo_url: httpUrl(p.github_repo_url),
      demo_url: httpUrl(p.portfolio_url),
      hero_image_url: httpUrl(p.hero_image_url),
      record_slug: recordSlugByProject.get(str(p.id) ?? '') ?? null,
    }))
    .filter((p) => p.title !== '');

  // The resume history. Raw model output in, capped and type-checked rows out.
  const resume: any = (input.resume && typeof input.resume === 'object') ? input.resume : {};
  const experience = normalizeExperience(resume.experience);
  const education = normalizeEducation(resume.education);

  const rawRecords: any[] = Array.isArray(input.records) ? input.records : [];
  const records: PublicRecord[] = rawRecords
    .filter((r) => r && typeof r === 'object' && str(r.slug))
    .map((r) => ({
      slug: str(r.slug)!,
      title: recordTitle(r),
      published_at: str(r.published_at),
    }));

  // Repos: a public one is named and linked, a private one is only counted.
  const rawRepos: any[] = Array.isArray(profile?.github?.repos) ? profile.github.repos : [];
  const repositories: PublicRepository[] = [];
  let privateCount = 0;
  for (const r of rawRepos) {
    if (!r || typeof r !== 'object') continue;
    const url = httpUrl(r.html_url ?? r.url);
    const isPrivate = r.private === true || r.visibility === 'private';
    if (isPrivate || !url) {
      privateCount += 1;
      continue;
    }
    repositories.push({ name: str(r.name) ?? 'repository', url });
  }

  // The GitHub profile is derived from a repository we can actually see, so it is a fact
  // rather than a guess at a username from somebody's name. First public repo wins, which
  // keeps this deterministic.
  const firstRepo = repositories[0]?.url;
  if (firstRepo) {
    const owner = /^https?:\/\/github\.com\/([A-Za-z0-9._-]+)(?:\/|$)/.exec(firstRepo);
    if (owner) identity.github_url = `https://github.com/${owner[1]}`;
  }

  const overview = {
    fullName: identity.full_name,
    headline: identity.headline,
    // The employer comes from the PUBLISHED experience, never from `identity.company`.
    // That field is on the refusal list, and feeding it to the composer would have
    // published it in prose - a leak the contract test caught on the first run.
    company: null,
    experience,
    projectName: str(input.projectName),
    projectDescriptor: str(input.projectDescriptor),
    capabilityCount: capabilities.length,
    filesCommitted: typeof input.filesCommitted === 'number' ? input.filesCommitted : null,
    evidenceRecords: typeof input.evidenceRecords === 'number' ? input.evidenceRecords : null,
  };

  // Competencies are capped for readability, but the honest total travels with them so
  // the page can say "12 of 19" rather than implying nineteen is all there is.
  const competencies = normalizeCompetencies(input.competencies);

  return {
    identity,
    about: composeAbout(overview),
    stats: composeStats(overview),
    featured: composeFeatured({
      name: str(input.projectName),
      repoUrl: input.featuredRepoUrl,
      files: overview.filesCommitted,
      topLevelAreas: input.featuredTopLevelAreas,
      capabilities: capabilities.length,
      languages: input.featuredLanguages,
    }),
    competencies,
    competency_domain_count: countCompetencyDomains(input.competencies),
    evidence_by_source: normalizeEvidenceSources(input.evidenceBySource),
    experience,
    education,
    capabilities,
    projects,
    records,
    repositories,
    private_repository_count: privateCount,
    generated_at: input.generatedAt,
  };
}
