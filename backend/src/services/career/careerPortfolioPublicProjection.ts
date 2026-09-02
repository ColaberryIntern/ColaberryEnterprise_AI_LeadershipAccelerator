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
 * WHAT THE PRIVATE PROFILE CARRIES THAT MUST NEVER CROSS. `CareerProfileResponse` is
 * built for the learner's own eyes and holds, among other things:
 *
 *   identity.email                 personal contact detail
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


// ── The public shapes. This is the entire contract. ────────────────────────

export interface PublicIdentity {
  full_name: string;
  headline: string | null;
  cohort_name: string | null;
  avatar_data_url: string | null;
  linkedin_url: string | null;
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
}

export interface PublicRepository {
  name: string;
  url: string;
}

export interface PublicPortfolio {
  identity: PublicIdentity;
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
    }))
    .filter((p) => p.title !== '');

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

  return {
    identity,
    capabilities,
    projects,
    records,
    repositories,
    private_repository_count: privateCount,
    generated_at: input.generatedAt,
  };
}
