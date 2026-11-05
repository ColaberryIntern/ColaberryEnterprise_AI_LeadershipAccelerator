import { classifyFinding, withClassification } from '../classifyFinding';
import type { CheckFinding } from '../proposalReviewTypes';

/**
 * One case per row of the v3 classification table: who resolves each finding, and — for human ones — that the typed
 * need is complete (kind, key, ask, why, format, blocking). This is the rail behind acceptance #2 ("every finding has
 * a resolver; every human-resolved finding has a complete need").
 */
const f = (over: Partial<CheckFinding> & Pick<CheckFinding, 'check' | 'severity' | 'message'>): CheckFinding => over;

describe('agent-fixable findings', () => {
  it('coverage gap → agent with a fix hint', () => {
    const c = classifyFinding(f({ check: 'coverage', severity: 'major', message: 'Requirement R5 is not yet answered in a section.' }));
    expect(c.resolver).toBe('agent');
    expect(c.fixHint).toMatch(/section/i);
    expect(c.need).toBeUndefined();
  });
  it('over the page limit → agent', () => {
    expect(classifyFinding(f({ check: 'format', severity: 'fatal', message: 'Over the 30-page limit (rendered 31).' })).resolver).toBe('agent');
  });
  it('price leak → agent (the agent removes it)', () => {
    expect(classifyFinding(f({ check: 'format', severity: 'fatal', message: 'A price/currency amount appears in a non-pricing document (price must stay in the sealed cost file).' })).resolver).toBe('agent');
  });
  it('evaluator + clarity weaknesses → agent', () => {
    expect(classifyFinding(f({ check: 'evaluator', severity: 'major', message: 'Weak against Section M factor 2.' })).resolver).toBe('agent');
    expect(classifyFinding(f({ check: 'clarity', severity: 'minor', message: 'Reads at grade 15.' })).resolver).toBe('agent');
  });
});

describe('human-needed findings carry a complete need', () => {
  it('missing required form → human file need, fatal', () => {
    const c = classifyFinding(f({ check: 'format', severity: 'fatal', message: 'Required form not attached: Texas HUB Subcontracting Plan.' }), { docKey: 'hub', sectionKey: 's1' });
    expect(c.resolver).toBe('human');
    expect(c.need).toMatchObject({ kind: 'file', blocking: 'fatal' });
    expect(c.need?.key).toMatch(/^file:form:/);
    expect(c.need?.ask).toContain('Texas HUB Subcontracting Plan');
    expect(c.need?.usedIn).toEqual([{ docKey: 'hub', sectionKey: 's1' }]);
    expect(c.need?.why).toBeTruthy();
    expect(c.need?.format).toBeTruthy();
  });
  it('missing signature → human signature need, fatal', () => {
    const c = classifyFinding(f({ check: 'format', severity: 'fatal', message: 'Required signature missing: Execution of Offer.' }));
    expect(c.resolver).toBe('human');
    expect(c.need).toMatchObject({ kind: 'signature', blocking: 'fatal' });
    expect(c.need?.key).toMatch(/^signature:/);
  });
  it('placeholder / filler / open question → human (the per-gap need carries the ask)', () => {
    for (const message of ['3 unresolved [PLACEHOLDER] marker(s) in the content.', '1 filler placeholder(s) must be replaced before submission.', '2 open question(s) await an answer.']) {
      expect(classifyFinding(f({ check: 'fact', severity: 'fatal', message })).resolver).toBe('human');
    }
  });
  it('unbacked claim with no evidence anywhere → human fact need', () => {
    const c = classifyFinding(f({ check: 'proof', severity: 'major', message: 'Claim has no evidence: 40% faster processing.' }), { docKey: 'tech', evidenceAvailable: false });
    expect(c.resolver).toBe('human');
    expect(c.need).toMatchObject({ kind: 'fact', blocking: 'score' });
    expect(c.need?.key).toMatch(/^fact:evidence:/);
  });
});

describe('context-sensitive proof', () => {
  it('unbacked claim WITH evidence available → agent cites it', () => {
    const c = classifyFinding(f({ check: 'proof', severity: 'major', message: 'Claim has no evidence cited.' }), { evidenceAvailable: true });
    expect(c.resolver).toBe('agent');
    expect(c.fixHint).toMatch(/cite/i);
  });
});

describe('withClassification', () => {
  it('stamps resolver/need onto the finding without mutating the input', () => {
    const input = f({ check: 'format', severity: 'fatal', message: 'Required signature missing: W-9.' });
    const out = withClassification(input, { docKey: 'certs' });
    expect(out.resolver).toBe('human');
    expect(out.need?.kind).toBe('signature');
    expect((input as CheckFinding).resolver).toBeUndefined();
  });
});
