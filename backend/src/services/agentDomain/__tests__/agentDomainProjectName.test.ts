/**
 * AF2.7 item 3 — a provisioned agent-domain project is named, not keyed.
 *
 * `projects.name` was set to `plan.domain_key`, so the ten landed in production reading
 * `admissions`, `product_experience`, `learner_success` — snake_case, lower case — on the same
 * student project page and admin Delivery board where every other project carries a real name
 * (CoreOps, HosPulse, Ambit, Ledgerly). Interns saw this on their own project.
 *
 * Two layers here, because neither is sufficient alone:
 *   - the naming RULE, tested against the real registry data;
 *   - a source guard on the provisioner, because provisioning a project needs a live database
 *     and a real transaction, so `agentDomainProvisioner.test.ts` already asserts that module's
 *     behaviour by reading its text. This follows that established approach rather than
 *     inventing a second one.
 */
import fs from 'fs';
import path from 'path';
import { AGENT_DOMAIN_KEYS, AGENT_DOMAINS, domainProjectName } from '../agentDomainRegistry';

describe('domainProjectName', () => {
  it('gives every one of the ten a human title', () => {
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(domainProjectName(key)).toBe(AGENT_DOMAINS.find((d) => d.domain_key === key)!.title);
    }
  });

  /** The defect itself, stated as an invariant: a name must not be the machine key. */
  it('never returns the raw key for a known domain', () => {
    for (const key of AGENT_DOMAIN_KEYS) expect(domainProjectName(key)).not.toBe(key);
  });

  it('never returns a snake_case lower-case string for a known domain', () => {
    // What the ten actually looked like on screen. Catches a title that regressed to key-shape
    // without naming any particular domain, so an eleventh inherits the rule.
    for (const key of AGENT_DOMAIN_KEYS) {
      expect(domainProjectName(key)).not.toMatch(/^[a-z]+(_[a-z]+)*$/);
    }
  });

  it('falls back to the key for an unknown domain instead of throwing', () => {
    // A display string must never be the reason a project fails to provision.
    expect(domainProjectName('not_a_domain')).toBe('not_a_domain');
    expect(() => domainProjectName('')).not.toThrow();
  });
});

describe('the provisioner itself', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'agentDomainProvisioner.ts'), 'utf8');

  it('no longer names a project with the raw domain key', () => {
    expect(source).not.toMatch(/name:\s*plan\.domain_key/);
  });

  it('names it through domainProjectName, the same function the repair script uses', () => {
    expect(source).toMatch(/name:\s*domainProjectName\(plan\.domain_key\)/);
    expect(source).toMatch(/import\s*\{\s*domainProjectName\s*\}\s*from\s*'\.\/agentDomainRegistry'/);
  });

  it('and the guard above can actually see this file', () => {
    // Without this, a typo'd path would read an empty string and pass both assertions.
    expect(source).toContain('Project.findOrCreate');
  });
});
