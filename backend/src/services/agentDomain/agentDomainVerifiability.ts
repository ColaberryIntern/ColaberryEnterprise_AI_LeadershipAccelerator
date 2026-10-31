/**
 * Decides, from evidence, whether an agent-domain project can be reached by the ONE code path
 * that runs story verification. Pure: no database, no I/O. AF4.1.
 *
 * ## The question this answers
 *
 * The agent workspace tells an intern "stories cannot be verified and no points are awarded until
 * a repo is connected: verification is a read of your repo". Verification runs in exactly one
 * place -- `POST /api/portal/project/verify` (`routes/projectRoutes.ts`) -> `verifyProject(
 * enrollmentId)` -> `getProjectByEnrollment(enrollmentId)` -- and the enrollment id is taken from
 * the caller's own participant token (`req.participant!.sub`), never from a parameter. Whatever
 * that resolves to IS the project whose requirements get verified; everything else is invisible to
 * the verifier.
 *
 * So "can an intern's domain story be verified?" reduces to a question about data: is a domain
 * project reachable from a human's enrollment through `getProjectByEnrollment`? That function has
 * exactly two ways to return a project, and both are enumerable:
 *
 *   1. POINTER   -- `enrollments.active_project_id` names it, and the row is not archived.
 *   2. FALLBACK  -- the pointer is unset or names a dead row, so it returns the NEWEST live
 *                   project carrying `projects.enrollment_id = <that enrollment>`, excluding
 *                   `PROTECTED_PROJECT_IDS`.
 *
 * ## Why this is a measurement and not a static guess
 *
 * Both paths are exhaustively enumerable with one query each -- the pointer path by asking which
 * enrollments point at these ten ids, the fallback path because it requires
 * `projects.enrollment_id` to equal the caller's enrollment, so only the ten rows' own owners can
 * ever reach them that way. The verdict below is therefore not a sample: it is every enrollment
 * from which the verifier could resolve a domain project. A sampled version of this question would
 * be worthless, because the interesting answer is an absence.
 *
 * ## Why the controls exist, and why they can veto the verdict
 *
 * The expected answer here is "no enrollment reaches these rows" -- an absence. An absence is
 * exactly what a broken query also returns. A typo in a uuid, a renamed column, an empty table, a
 * `WHERE` that matches nothing: every one of those produces a confident, wrong "confirmed". So no
 * verdict is reported unless controls prove the reads can see a hit when one exists, in BOTH
 * directions: that the pointer read finds real pointers, that the fallback read returns a row for
 * an enrollment that does match, and that it returns a NON-domain row for somebody (so it is not
 * simply handing back domain rows, or the same row, regardless of input). If any control fails the
 * verdict is INCONCLUSIVE and the failing control is named. `INCONCLUSIVE` is a result, not an
 * error: it says the question was not answered, which is different from answering it "no".
 */
import { AGENT_DOMAIN_KEYS } from './agentDomainRegistry';

/** One enrollment, carrying everything `getProjectByEnrollment` consults for it. */
export interface EnrollmentFacts {
  readonly enrollment_id: string;
  readonly email: string | null;
  /** An `admin_users` row with `role = 'ai_staff'`. The provisioner attaches domain projects to
   *  an ai_staff enrollment on purpose, so this is what separates "a human could verify" from
   *  "only the service account could". */
  readonly is_ai_staff: boolean;
  readonly active_project_id: string | null;
  /** True only when the pointer names a row that exists and is not archived -- the one case where
   *  `getProjectByEnrollment` returns the pointed project instead of falling through. */
  readonly active_pointer_resolves: boolean;
  /** What the fallback would return for this enrollment: newest live non-protected project. */
  readonly fallback_project_id: string | null;
}

/** One of the ten derived domain projects, as production actually holds it. */
export interface DomainProjectFacts {
  readonly domain_key: string;
  readonly project_id: string;
  readonly present: boolean;
  readonly archived: boolean;
  readonly name: string | null;
  readonly owner_enrollment_id: string | null;
}

export interface Evidence {
  readonly domains: readonly DomainProjectFacts[];
  /** Every enrollment that either points at one of the ten or owns one, plus the control sample. */
  readonly enrollments: readonly EnrollmentFacts[];
}

export type ReachPath = 'pointer' | 'fallback';

export interface Reach {
  readonly enrollment_id: string;
  readonly email: string | null;
  readonly is_ai_staff: boolean;
  readonly path: ReachPath;
}

export interface DomainVerdict {
  readonly domain: DomainProjectFacts;
  /** Every enrollment the verifier could resolve this project from. Empty means unreachable. */
  readonly reached_from: readonly Reach[];
}

export interface Control {
  readonly id: string;
  readonly question: string;
  readonly passed: boolean;
  readonly detail: string;
}

export type Verdict =
  /** A control failed: the reads are not trustworthy, so no conclusion is drawn. */
  | 'INCONCLUSIVE'
  /** A domain project is reachable from a non-ai_staff enrollment: a human CAN verify a domain
   *  story, and the reported gap does not exist. */
  | 'GAP_DISPROVED'
  /** Reachable, but only from an ai_staff enrollment: no human can verify a domain story. */
  | 'GAP_CONFIRMED_STAFF_ONLY'
  /** Reachable from nothing at all. */
  | 'GAP_CONFIRMED_UNREACHABLE';

export interface Report {
  readonly verdict: Verdict;
  readonly controls: readonly Control[];
  readonly domains: readonly DomainVerdict[];
}

/**
 * Every enrollment from which `getProjectByEnrollment` would return this domain project.
 *
 * The pointer branch checks the row is live because the function does: an archived project is
 * skipped even when the pointer still names it. The fallback branch requires the pointer NOT to
 * resolve, because the fallback only runs when the pointer has already failed -- an enrollment
 * with a healthy pointer to its capstone never reaches the fallback, so a domain project sitting
 * in its fallback position is still unreachable for it.
 */
export function reachesFrom(
  domain: DomainProjectFacts,
  enrollments: readonly EnrollmentFacts[],
): Reach[] {
  if (!domain.present || domain.archived) return [];
  const out: Reach[] = [];
  for (const e of enrollments) {
    const base = { enrollment_id: e.enrollment_id, email: e.email, is_ai_staff: e.is_ai_staff };
    if (e.active_project_id === domain.project_id) {
      out.push({ ...base, path: 'pointer' });
    } else if (!e.active_pointer_resolves && e.fallback_project_id === domain.project_id) {
      out.push({ ...base, path: 'fallback' });
    }
  }
  return out;
}

/**
 * The controls that decide whether this run's absence means anything.
 *
 * Each one is a positive assertion -- "this read CAN see X" -- because the verdict is a negative.
 * CTL-5 is the one that catches the subtlest failure: a fallback query that returned domain rows
 * for every input, or the same row regardless of input, would satisfy CTL-3 and still be useless.
 */
export function evaluateControls(ev: Evidence): Control[] {
  const ten = new Set(ev.domains.map((d) => d.project_id));
  const present = ev.domains.filter((d) => d.present);
  const resolvingPointers = ev.enrollments.filter((e) => e.active_pointer_resolves);
  const withFallback = ev.enrollments.filter((e) => e.fallback_project_id !== null);
  const nonDomainFallback = withFallback.filter((e) => !ten.has(String(e.fallback_project_id)));

  return [
    {
      id: 'CTL-1',
      question: 'Can the pointer read see a live active_project_id at all?',
      passed: resolvingPointers.length > 0,
      detail: `${resolvingPointers.length} of ${ev.enrollments.length} sampled enrollments have a pointer that resolves to a live project`,
    },
    {
      id: 'CTL-2',
      question: 'Do all ten derived domain project rows exist?',
      passed: present.length === AGENT_DOMAIN_KEYS.length,
      detail: `${present.length} of ${AGENT_DOMAIN_KEYS.length} present`
        + (present.length === AGENT_DOMAIN_KEYS.length
          ? ''
          : ' -- a missing row is unreachable for the wrong reason, which is not the finding'),
    },
    {
      id: 'CTL-3',
      question: 'Can the fallback read return a row for an enrollment that does match?',
      passed: withFallback.length > 0,
      detail: `${withFallback.length} of ${ev.enrollments.length} sampled enrollments resolve to a fallback project`,
    },
    {
      id: 'CTL-4',
      question: 'Is every present domain row\'s owning enrollment identified?',
      passed: present.every((d) => !!d.owner_enrollment_id),
      detail: `${present.filter((d) => !!d.owner_enrollment_id).length} of ${present.length} present rows name an owner`,
    },
    {
      id: 'CTL-5',
      question: 'Does the fallback read return a NON-domain row for somebody (so it is not just handing back domain rows)?',
      passed: nonDomainFallback.length > 0,
      detail: `${nonDomainFallback.length} sampled enrollments fall back to a project that is not one of the ten`,
    },
  ];
}

export function classify(ev: Evidence): Report {
  const controls = evaluateControls(ev);
  const domains = ev.domains.map((domain) => ({
    domain,
    reached_from: reachesFrom(domain, ev.enrollments),
  }));

  const allReaches = domains.flatMap((d) => d.reached_from);
  let verdict: Verdict;
  if (controls.some((c) => !c.passed)) verdict = 'INCONCLUSIVE';
  else if (allReaches.some((r) => !r.is_ai_staff)) verdict = 'GAP_DISPROVED';
  else if (allReaches.length > 0) verdict = 'GAP_CONFIRMED_STAFF_ONLY';
  else verdict = 'GAP_CONFIRMED_UNREACHABLE';

  return { verdict, controls, domains };
}

/** What each verdict means, spelled out, so the operator does not have to infer it from a token. */
export const VERDICT_MEANING: Readonly<Record<Verdict, string>> = Object.freeze({
  INCONCLUSIVE:
    'A control failed, so this run proves NOTHING either way. Fix the failing control before quoting any result from it.',
  GAP_DISPROVED:
    'A domain project IS reachable from a non-ai_staff enrollment, so a human can verify a domain story. The reported gap does not exist.',
  GAP_CONFIRMED_STAFF_ONLY:
    'Domain projects are reachable only from an ai_staff enrollment. No intern can verify a domain story through the only route that runs the verifier.',
  GAP_CONFIRMED_UNREACHABLE:
    'No enrollment at all reaches a domain project. No domain story can be verified by anyone through the only route that runs the verifier.',
});

export function renderReport(r: Report): string {
  const lines: string[] = ['=== AGENT-DOMAIN STORY VERIFIABILITY ===', ''];

  lines.push('controls (each must pass, or the verdict is void):');
  for (const c of r.controls) {
    lines.push(`  ${c.passed ? 'PASS' : 'FAIL'}  ${c.id}  ${c.question}`);
    lines.push(`          ${c.detail}`);
  }
  lines.push('');

  lines.push('per domain -- enrollments the verifier could resolve it from:');
  for (const d of r.domains) {
    const dom = d.domain;
    if (!dom.present) {
      lines.push(`  ROW MISSING      ${dom.domain_key.padEnd(24)} ${dom.project_id}`);
      continue;
    }
    const state = dom.archived ? 'ARCHIVED' : 'live';
    const owner = dom.owner_enrollment_id ?? 'NO OWNER';
    lines.push(`  ${dom.domain_key.padEnd(24)} ${state.padEnd(8)} owner=${owner}  name=${JSON.stringify(dom.name)}`);
    if (d.reached_from.length === 0) {
      lines.push('      reached from: NOTHING');
    } else {
      for (const reach of d.reached_from) {
        lines.push(`      reached from: ${reach.email ?? reach.enrollment_id} via ${reach.path}`
          + ` (${reach.is_ai_staff ? 'ai_staff' : 'NOT ai_staff -- a human'})`);
      }
    }
  }
  lines.push('');

  lines.push(`VERDICT: ${r.verdict}`);
  lines.push(VERDICT_MEANING[r.verdict]);
  return lines.join('\n');
}
