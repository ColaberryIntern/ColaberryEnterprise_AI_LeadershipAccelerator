/**
 * Whether an agent-domain story can be verified, and by whom. AF4.1.
 *
 * The defect this guards against is a FALSE CONFIRMATION. The expected answer is an absence --
 * "no enrollment can reach these rows" -- and an absence is also what a broken query, an empty
 * table or a mistyped uuid returns. So the tests here spend most of their effort on the ways a
 * wrong "confirmed" could be produced: an empty read, a missing row, a fallback query that hands
 * back domain rows for everybody. Each of those must come out INCONCLUSIVE, not confirmed.
 *
 * The reachability tests exist because `getProjectByEnrollment`'s fallback is conditional. An
 * earlier reading of this problem looked only at `enrollments.active_project_id` and would have
 * reported a gap that the fallback branch could have disproved.
 */
import fs from 'fs';
import path from 'path';
import { AGENT_DOMAIN_KEYS } from '../agentDomainRegistry';
import {
  classify,
  evaluateControls,
  reachesFrom,
  renderReport,
  VERDICT_MEANING,
  type DomainProjectFacts,
  type EnrollmentFacts,
  type Evidence,
} from '../agentDomainVerifiability';

const pid = (key: string): string => `proj-${key}`;
const OWNER = 'enr-ai-staff';

function domain(key: string, over: Partial<DomainProjectFacts> = {}): DomainProjectFacts {
  return {
    domain_key: key,
    project_id: pid(key),
    present: true,
    archived: false,
    name: 'Some Domain',
    owner_enrollment_id: OWNER,
    ...over,
  };
}

/** All ten present and live, owned by the ai_staff enrollment -- production's shape. */
const allTen = (over: Partial<DomainProjectFacts> = {}): DomainProjectFacts[] =>
  AGENT_DOMAIN_KEYS.map((k) => domain(k, over));

function enrollment(id: string, over: Partial<EnrollmentFacts> = {}): EnrollmentFacts {
  return {
    enrollment_id: id,
    email: `${id}@example.com`,
    is_ai_staff: false,
    active_project_id: null,
    active_pointer_resolves: false,
    fallback_project_id: null,
    ...over,
  };
}

/**
 * The control group. A human with a healthy pointer to their own capstone satisfies CTL-1, CTL-3
 * and CTL-5 at once: the pointer read sees a live pointer, and the fallback read returns a row
 * that is not one of the ten.
 */
const controlHuman = enrollment('enr-student', {
  active_project_id: 'proj-capstone',
  active_pointer_resolves: true,
  fallback_project_id: 'proj-capstone',
});

/** The ai_staff enrollment the provisioner attaches domain projects to. */
const staffOwner = (over: Partial<EnrollmentFacts> = {}): EnrollmentFacts =>
  enrollment(OWNER, { is_ai_staff: true, ...over });

const evidence = (over: Partial<Evidence> = {}): Evidence => ({
  domains: allTen(),
  enrollments: [controlHuman, staffOwner()],
  ...over,
});

describe('reachesFrom', () => {
  it('finds the pointer path when an enrollment points straight at the project', () => {
    const d = domain('admissions');
    const reaches = reachesFrom(d, [enrollment('enr-x', {
      active_project_id: pid('admissions'),
      active_pointer_resolves: true,
    })]);
    expect(reaches).toHaveLength(1);
    expect(reaches[0].path).toBe('pointer');
    expect(reaches[0].enrollment_id).toBe('enr-x');
  });

  it('finds the fallback path when the pointer is unset and the project is the fallback row', () => {
    const reaches = reachesFrom(domain('admissions'), [enrollment('enr-x', {
      active_project_id: null,
      active_pointer_resolves: false,
      fallback_project_id: pid('admissions'),
    })]);
    expect(reaches).toHaveLength(1);
    expect(reaches[0].path).toBe('fallback');
  });

  /**
   * THE LOAD-BEARING ONE. The fallback only runs when the pointer has already failed. An
   * enrollment with a healthy pointer to its capstone never reaches the fallback, so a domain
   * project sitting in its fallback position is still unreachable for it. Dropping the
   * `!active_pointer_resolves` condition would over-report reachability and wrongly disprove the
   * gap -- the failure mode that would send somebody to fix nothing.
   */
  it('does NOT count the fallback when the pointer already resolves', () => {
    const reaches = reachesFrom(domain('admissions'), [enrollment('enr-x', {
      active_project_id: 'proj-capstone',
      active_pointer_resolves: true,
      fallback_project_id: pid('admissions'),
    })]);
    expect(reaches).toEqual([]);
  });

  it('treats an archived domain project as unreachable even when a pointer names it', () => {
    const reaches = reachesFrom(domain('admissions', { archived: true }), [enrollment('enr-x', {
      active_project_id: pid('admissions'),
      active_pointer_resolves: false,
    })]);
    expect(reaches).toEqual([]);
  });

  it('treats a missing row as unreachable rather than as a finding', () => {
    expect(reachesFrom(domain('admissions', { present: false }), [controlHuman])).toEqual([]);
  });

  it('reports every enrollment that reaches it, not just the first', () => {
    const reaches = reachesFrom(domain('admissions'), [
      enrollment('enr-a', { active_project_id: pid('admissions'), active_pointer_resolves: true }),
      enrollment('enr-b', { fallback_project_id: pid('admissions') }),
    ]);
    expect(reaches.map((r) => r.enrollment_id)).toEqual(['enr-a', 'enr-b']);
  });

  it('carries the ai_staff flag through, since that is what separates a human from the service account', () => {
    const reaches = reachesFrom(domain('admissions'), [staffOwner({
      active_project_id: pid('admissions'),
      active_pointer_resolves: true,
    })]);
    expect(reaches[0].is_ai_staff).toBe(true);
  });
});

describe('controls', () => {
  const idsOf = (ev: Evidence) => evaluateControls(ev).filter((c) => !c.passed).map((c) => c.id);

  it('all pass on well-formed evidence', () => {
    expect(idsOf(evidence())).toEqual([]);
  });

  it('CTL-1 fails when no sampled enrollment has a pointer that resolves', () => {
    const ev = evidence({ enrollments: [enrollment('enr-x', { fallback_project_id: 'proj-other' })] });
    expect(idsOf(ev)).toContain('CTL-1');
  });

  it('CTL-2 fails when any of the ten rows is missing', () => {
    const domains = allTen();
    const ev = evidence({ domains: [{ ...domains[0], present: false }, ...domains.slice(1)] });
    expect(idsOf(ev)).toContain('CTL-2');
  });

  it('CTL-3 fails when the fallback read returns a row for nobody', () => {
    const ev = evidence({
      enrollments: [enrollment('enr-x', { active_project_id: 'p', active_pointer_resolves: true })],
    });
    expect(idsOf(ev)).toContain('CTL-3');
  });

  it('CTL-4 fails when a present domain row names no owner', () => {
    const domains = allTen();
    const ev = evidence({ domains: [{ ...domains[0], owner_enrollment_id: null }, ...domains.slice(1)] });
    expect(idsOf(ev)).toContain('CTL-4');
  });

  /**
   * CTL-5 catches the subtlest broken read: a fallback query that returned domain rows for every
   * input would satisfy CTL-3 and still tell us nothing. Here every sampled enrollment falls back
   * to a domain row, which is not a credible production state.
   */
  it('CTL-5 fails when every sampled fallback is one of the ten', () => {
    const ev = evidence({
      enrollments: [
        enrollment('enr-x', {
          active_project_id: 'p', active_pointer_resolves: true, fallback_project_id: pid('admissions'),
        }),
      ],
    });
    expect(idsOf(ev)).toContain('CTL-5');
  });

  it('names a count in every detail line, so a pass is auditable rather than a bare word', () => {
    for (const c of evaluateControls(evidence())) {
      expect(c.detail).toMatch(/\d/);
    }
  });
});

describe('classify', () => {
  it('confirms the gap as staff-only when only the ai_staff owner reaches a domain project', () => {
    const ev = evidence({
      enrollments: [
        controlHuman,
        staffOwner({ fallback_project_id: pid(AGENT_DOMAIN_KEYS[0]) }),
      ],
    });
    const r = classify(ev);
    expect(r.verdict).toBe('GAP_CONFIRMED_STAFF_ONLY');
    expect(r.domains.find((d) => d.domain.domain_key === AGENT_DOMAIN_KEYS[0])!.reached_from)
      .toHaveLength(1);
  });

  it('confirms the gap as unreachable when nothing reaches any domain project', () => {
    expect(classify(evidence()).verdict).toBe('GAP_CONFIRMED_UNREACHABLE');
  });

  /**
   * The verdict that must win over a confirmation. One human able to reach a domain project means
   * the reported gap does not exist, however many other domains are unreachable -- so a single
   * non-ai_staff reach outranks nine confirmations.
   */
  it('disproves the gap when ONE non-ai_staff enrollment reaches a domain project', () => {
    const ev = evidence({
      enrollments: [
        controlHuman,
        staffOwner({ fallback_project_id: pid(AGENT_DOMAIN_KEYS[0]) }),
        enrollment('enr-intern', {
          active_project_id: pid(AGENT_DOMAIN_KEYS[1]),
          active_pointer_resolves: true,
        }),
      ],
    });
    const r = classify(ev);
    expect(r.verdict).toBe('GAP_DISPROVED');
  });

  it('a failing control outranks every conclusion, including a disproof', () => {
    const domains = allTen();
    const ev = evidence({
      domains: [{ ...domains[0], present: false }, ...domains.slice(1)],
      enrollments: [
        controlHuman,
        enrollment('enr-intern', {
          active_project_id: pid(AGENT_DOMAIN_KEYS[1]), active_pointer_resolves: true,
        }),
      ],
    });
    expect(classify(ev).verdict).toBe('INCONCLUSIVE');
  });

  /**
   * THE BOUNDARY THAT MATTERS. An empty read -- wrong database, dead connection, a filter that
   * matched nothing -- produces zero reaches, which is textually identical to the finding. It must
   * come out INCONCLUSIVE. If this test ever passes as CONFIRMED, the script can report a gap
   * while measuring nothing.
   */
  it('an empty read is INCONCLUSIVE, never a confirmed absence', () => {
    expect(classify({ domains: [], enrollments: [] }).verdict).toBe('INCONCLUSIVE');
    expect(classify({ domains: allTen(), enrollments: [] }).verdict).toBe('INCONCLUSIVE');
  });

  it('is pure: classifying twice gives the same verdict and mutates no input', () => {
    const ev = evidence();
    const snapshot = JSON.stringify(ev);
    expect(classify(ev).verdict).toBe(classify(ev).verdict);
    expect(JSON.stringify(ev)).toBe(snapshot);
  });

  it('reports one verdict per domain, for all ten', () => {
    expect(classify(evidence()).domains).toHaveLength(AGENT_DOMAIN_KEYS.length);
  });
});

describe('renderReport', () => {
  it('prints the verdict and what it means, not just the token', () => {
    const out = renderReport(classify(evidence()));
    expect(out).toContain('VERDICT: GAP_CONFIRMED_UNREACHABLE');
    expect(out).toContain(VERDICT_MEANING.GAP_CONFIRMED_UNREACHABLE);
  });

  it('shows every control with its pass state, so a reader can see the verdict was earned', () => {
    const out = renderReport(classify(evidence()));
    for (const id of ['CTL-1', 'CTL-2', 'CTL-3', 'CTL-4', 'CTL-5']) {
      expect(out).toContain(id);
    }
    expect(out).toContain('PASS');
  });

  it('marks a human reach as a human, in words', () => {
    const ev = evidence({
      enrollments: [controlHuman, enrollment('enr-intern', {
        active_project_id: pid(AGENT_DOMAIN_KEYS[0]), active_pointer_resolves: true,
      })],
    });
    expect(renderReport(classify(ev))).toContain('NOT ai_staff -- a human');
  });

  it('says NOTHING rather than leaving an unreachable domain blank', () => {
    expect(renderReport(classify(evidence()))).toContain('reached from: NOTHING');
  });

  it('calls out a missing row instead of folding it in with the unreachable ones', () => {
    const domains = allTen();
    const ev = evidence({ domains: [{ ...domains[0], present: false }, ...domains.slice(1)] });
    expect(renderReport(classify(ev))).toContain('ROW MISSING');
  });
});

/**
 * It runs against the production database, so it must not be able to write. The scan names no
 * specific statement list of its own beyond the write verbs: a new mutating call added later is
 * caught without this test being edited.
 */
describe('the query script is read-only by construction', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', 'scripts', 'queryAgentDomainVerifiability.ts'),
    'utf8',
  );

  it('issues no write statement', () => {
    expect(source).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s/i);
  });

  it('calls no mutating model or query helper', () => {
    expect(source).not.toMatch(/\.(create|update|destroy|upsert|bulkCreate|findOrCreate|save)\s*\(/);
    expect(source).not.toMatch(/QueryTypes\.(INSERT|UPDATE|DELETE|BULKUPDATE|BULKDELETE)/);
  });

  it('runs every query as a SELECT', () => {
    const queries = source.match(/type:\s*QueryTypes\.\w+/g) ?? [];
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.every((q) => q.endsWith('SELECT'))).toBe(true);
  });

  it('and the scan can actually see this file', () => {
    expect(source).toContain('export async function gatherEvidence');
  });
});
