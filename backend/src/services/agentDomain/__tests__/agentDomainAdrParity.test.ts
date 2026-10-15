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

  it('it names the measured reachability rather than a remembered figure', () => {
    expect(adr).toMatch(/seven of ten/i);
    expect(adr).toMatch(/three carry a named blocker/i);
  });

  it('THE ADR FIGURE AGREES WITH THE REGISTRY, rather than being a literal of its own', () => {
    // This test previously asserted the ADR said "six of ten" and PASSED while the registry had
    // moved to seven, because asserting a literal is not a parity check. Derive both sides.
    const reachable = AGENT_DOMAINS.filter((d) => d.can_reach_surface).length;
    const blocked = AGENT_DOMAINS.length - reachable;
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    expect(adr.toLowerCase()).toContain(`${words[reachable]} of ten`);
    expect(adr.toLowerCase()).toContain(`${words[blocked]} carry a named blocker`);
  });

  it('it records the email-mismatch correction rather than silently restating the new figure', () => {
    expect(adr).toMatch(/email mismatch/i);
    expect(adr).toContain('org_members.enrollment_id');
  });

  it('it discloses the open gates this shape inherits without claiming to fix them', () => {
    expect(adr).toMatch(/release_review. and .launch_ready. pass unconditionally/);
  });

  it('the registry still holds ten domains, which is what 5.1b describes', () => {
    expect(AGENT_DOMAINS).toHaveLength(10);
  });
});
