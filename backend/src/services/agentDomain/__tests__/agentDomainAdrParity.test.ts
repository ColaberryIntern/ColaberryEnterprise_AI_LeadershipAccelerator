import * as fs from 'fs';
import * as path from 'path';
import {
  AGENT_DOMAIN_ENTRY_POINT,
  AGENT_DOMAINS,
} from '../agentDomainRegistry';

/**
 * Code-to-document parity for the fourth project shape.
 *
 * `carried-forward-obligations.md:267-268` instructs that a new project shape be stated in
 * `architecture.md` §5.1 "rather than only implemented, because the current wording reads as though
 * it already covers every case". A documentation obligation nobody checks decays, so this test
 * checks it: the entry-point literal the provisioner uses must appear in the ADR section that
 * describes it.
 */
const ADR_PATH = path.join(
  __dirname, '..', '..', '..', '..', '..', 'docs', 'project-lifecycle', 'architecture.md',
);

const adrRaw = fs.readFileSync(ADR_PATH, 'utf8');

/**
 * Prose in this ADR is hard-wrapped at ~100 columns, so a phrase can straddle a newline plus
 * indentation. Asserting on the raw text makes a passing test depend on where the line happened to
 * break, which is a false negative waiting to happen -- and did: a check for "four carry a named
 * blocker" failed only because the wrap fell between "four" and "carry". Collapse whitespace for
 * prose assertions; keep the raw text for structural ones.
 */
const adr = adrRaw.replace(/\s+/g, ' ');

describe('the ADR describes the fourth project shape', () => {
  it('the ADR file is where this test thinks it is, so a pass is meaningful', () => {
    // Without this, a wrong path would make every assertion below vacuously fail-or-pass on ''.
    expect(adrRaw.length).toBeGreaterThan(1000);
    expect(adr).toContain('## 5.1a Staff-initiated student builds');
  });

  it('section 5.1b exists', () => {
    expect(adr).toContain('## 5.1b Internal AI-employee domain projects');
  });

  it('the ADR carries the EXACT entry-point literal the code uses', () => {
    // The drift this prevents: renaming the constant without touching the ADR, or vice versa.
    expect(adr).toContain(AGENT_DOMAIN_ENTRY_POINT);
  });

  it('POSITIVE CONTROL: a literal the code does NOT use is absent from the ADR', () => {
    expect(adr).not.toContain('agent_domain_factory_provisioner_v2');
  });

  it('it records that the shape mints no new role and introduces no new login', () => {
    expect(adr).toMatch(/mints no new role and introduces no new login/i);
  });

  it('it refuses the 5.1a separation-of-duty exception rather than inheriting it', () => {
    expect(adr).toMatch(/does not claim .5\.1a.s separation-of-duty exception/i);
    expect(adr).toMatch(/approver . proposer. stands|approver ≠ proposer. stands/i);
  });

  it('it states that an agent may never hold accountable or approver', () => {
    expect(adr).toMatch(/agent may never hold accountable or approver/i);
  });

  it('it states that the provisioner never writes active_project_id or calls publishBuild', () => {
    expect(adr).toContain('enrollments.active_project_id');
    expect(adr).toContain('publishBuild');
  });

  /**
   * The two tests that used to live here pinned the ADR's reachability figure, once as a literal
   * and once derived from the registry so the two could not drift. Both passed while the figure
   * was wrong: the registry and the document agreed with each other and with neither production
   * nor the code. Parity between two frozen copies is not accuracy.
   *
   * So the ADR no longer states a figure, and these assert that it does not — and that it points
   * at where the answer is computed instead.
   */
  it('states NO reachability figure, because any figure it states goes stale', () => {
    expect(adr.toLowerCase()).not.toMatch(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten) of ten domains have a manager/);
    expect(adr.toLowerCase()).not.toMatch(/carry a named blocker\./);
  });

  it('names where reachability IS computed, so the reader has somewhere to go', () => {
    expect(adr).toContain('resolveManagerReach');
    expect(adr).toContain('managerReachResolver.ts');
  });

  it('records BOTH email-mismatch corrections, including that the second repeated the first', () => {
    // The October correction is kept rather than tidied away: it is the same mistake that recurred,
    // and a document that only records the latest answer teaches nobody why it was wrong.
    expect(adr).toMatch(/email mismatch/i);
    expect(adr).toContain('org_members');
    expect(adr).toMatch(/2026-10-08/);
    expect(adr).toMatch(/2026-11-12/);
    // The actual finding: the requirement everyone reasoned from was never the requirement.
    expect(adr.toLowerCase()).toContain('was never the');
  });

  it('it discloses the open gates this shape inherits without claiming to fix them', () => {
    expect(adr).toMatch(/release_review. and .launch_ready. pass unconditionally/);
  });

  it('the registry still holds ten domains, which is what 5.1b describes', () => {
    expect(AGENT_DOMAINS).toHaveLength(10);
  });
});
