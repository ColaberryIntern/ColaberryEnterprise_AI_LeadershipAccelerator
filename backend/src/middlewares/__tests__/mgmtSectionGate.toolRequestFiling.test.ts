/**
 * AF11.11 — everything a builder needs to FILE a tool request has to be reachable BY A BUILDER.
 *
 * ## This is the third time this failure mode has shipped, and the first two tests could not catch it
 *
 * `mgmtSectionGate.agentDomains.test.ts` exists because six interns got 403 on the page built for
 * them, and it records the lesson: *"the data was right, the roles were right, the route looked
 * right, and the answer was still 403."* Its assertion is that every agent-domain path is
 * CLASSIFIED, which is necessary and is not sufficient.
 *
 * AF11.9 then shipped the front door mapped to `program` and guarded by `requireAdmin`. The path
 * was classified, so the existing tests passed. But **no Agent Factory builder role carries
 * `program`** — `mgmtRoles.ts` grants it to `curriculum`, `admin` and `owner` only — so the front
 * door 403'd for every builder it was built for. Worse, `AddCapabilityFrontDoor` renders a failed
 * lookup as a soft *"could not check the catalog just now"*, so the permanent refusal looked like
 * a transient hiccup.
 *
 * So the assertion here is not "is it classified" but **"can the role that has to use it actually
 * reach it"**, checked against the real role definitions. That is the only form of this test that
 * would have failed on the AF11.9 code.
 */
import { pathToSection } from '../mgmtSectionGate';
import { roleCanAccessSection, sectionsForRole } from '../../services/access/mgmtRoles';

/**
 * The roles the Agent Factory builders actually hold. Same list as
 * `mgmtSectionGate.agentDomains.test.ts`, which measured them in production on 16 Oct 2026.
 */
const BUILDER_ROLES = [
  'marketing', 'platform', 'lead_intake', 'internship_review', 'revenue', 'product_experience',
] as const;

/**
 * Every path the filing flow reads or writes, from opening the page to submitting the form.
 *
 * Derived by walking `AdminChangeRequestsPage` and the components it renders: the domain list, the
 * front door, the capability picker, the people picker, the dataset picker and the filing POST.
 */
const FILING_FLOW_PATHS = [
  // The page's own two reads.
  '/api/admin/agent-domains-mine',
  '/api/admin/agent-domain-change-requests-mine',
  // AF11.9, the front door. The one that was broken.
  '/api/admin/agent-domain-product-features/ask',
  // AF12.5, the capability picker: the per-domain detail that carries `capabilities`.
  '/api/admin/agent-domains-mine/marketing',
  // The three pickers.
  '/api/admin/agent-domain-datasets',
  '/api/admin/agent-domain-actors',
];

describe('THE REAL ASSERTION: a builder can reach every step of filing', () => {
  for (const path of FILING_FLOW_PATHS) {
    it(`${path} is reachable by every builder role`, () => {
      const section = pathToSection(path);
      // Classified at all. Deny-by-default means an unmapped path is a silent 403.
      expect(section).not.toBeNull();
      for (const role of BUILDER_ROLES) {
        expect({ path, role, section, can: roleCanAccessSection(role, section!) })
          .toEqual({ path, role, section, can: true });
      }
    });
  }
});

describe('the front door, which is the one that regressed', () => {
  it('puts /ask on a section builders hold, not on program', () => {
    expect(pathToSection('/api/admin/agent-domain-product-features/ask')).toBe('dashboard');
  });

  it('REGRESSION GUARD: no builder role holds program, so /ask must never be mapped to it', () => {
    // This is the fact the AF11.9 reasoning missed. Asserting it directly means a future change
    // moving `/ask` back to `program` fails here with the reason attached, rather than shipping a
    // 403 that looks like a hiccup.
    for (const role of BUILDER_ROLES) {
      expect(sectionsForRole(role)).not.toContain('program');
    }
  });

  it('keeps the BROWSE list on program, because it enumerates the whole catalog', () => {
    // The narrower row must win, and the broader one must still be there. If `/ask` had been
    // appended after the broad row it would never be reached, since `pathToSection` returns the
    // first match in array order.
    expect(pathToSection('/api/admin/agent-domain-product-features')).toBe('program');
  });

  it('does not let the /ask row swallow a sibling under the same prefix', () => {
    // `matchesPrefix` needs an exact match or a `/` boundary, so the `/ask` row cannot capture
    // `/asking` or any future sibling. Those must still fall through to the broad `program` row.
    //
    // Asserted on PATHS, not URLs: the gate is handed `req.path`, which never carries a query
    // string. An earlier version of this test asked about
    // `...product-features?domain_key=marketing` and failed, correctly, because nothing ever
    // calls `pathToSection` with one.
    expect(pathToSection('/api/admin/agent-domain-product-features/asking')).toBe('program');
    expect(pathToSection('/api/admin/agent-domain-product-features/coverage')).toBe('program');
  });
});

describe('the deciding half stays where it was', () => {
  it('keeps the review console and the board on program', () => {
    // Widening the filing flow must not widen the approving flow. These are the surfaces that
    // show every builder's requests and every capability's position.
    expect(pathToSection('/api/admin/agent-domain-tool-requests')).toBe('program');
    expect(pathToSection('/api/admin/agent-domain-capability-board')).toBe('program');
    expect(pathToSection('/api/admin/agent-domain-change-requests')).toBe('program');
  });

  it('so no builder role can reach them', () => {
    for (const role of BUILDER_ROLES) {
      for (const path of [
        '/api/admin/agent-domain-tool-requests',
        '/api/admin/agent-domain-capability-board',
        '/api/admin/agent-domain-change-requests',
      ]) {
        expect({ role, path, can: roleCanAccessSection(role, pathToSection(path)!) })
          .toEqual({ role, path, can: false });
      }
    }
  });
});

describe('the people picker', () => {
  it('sits with the other filing-form pickers', () => {
    expect(pathToSection('/api/admin/agent-domain-actors')).toBe('dashboard');
    // The same section as the dataset picker, because it answers the same kind of question for
    // the same person at the same moment.
    expect(pathToSection('/api/admin/agent-domain-actors'))
      .toBe(pathToSection('/api/admin/agent-domain-datasets'));
  });

  it('is a distinct prefix from the agent-domains rows, so neither swallows the other', () => {
    expect(pathToSection('/api/admin/agent-domains')).toBe('program');
    expect(pathToSection('/api/admin/agent-domain-actors')).toBe('dashboard');
  });
});
