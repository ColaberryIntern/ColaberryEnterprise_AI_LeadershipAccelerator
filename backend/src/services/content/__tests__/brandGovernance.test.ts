import fs from 'fs';
import path from 'path';
import { checkContent, type BrandGovernanceRules, type ContentUnderReview } from '../brandGovernance';

/**
 * Brand governance reads its rules from DATA, and catches the three things the plan names.
 *
 * The data-not-constants property is proven two ways. Behaviourally: the same content passes
 * under one rule set and fails under another, so the verdict demonstrably depends on what was
 * handed in. Structurally: the module's source declares no rule constants - no PROHIBITED_*,
 * no BANNED_*, no hardcoded term list - so the only way a rule reaches a check is through the
 * parameter.
 */

const RULES: BrandGovernanceRules = {
  version: 3,
  voice: { tone: 'calm, authoritative', guidance: 'No hype. No exclamation marks in headlines.' },
  approvedOffers: [{ id: 'free-class', label: 'Free class', cta: 'Reserve your seat' }],
  requiredDisclosures: [
    { id: 'paid-disclosure', text: '#ad', when: 'paid' },
    { id: 'ai-disclosure', text: 'Drafted with AI assistance', when: 'ai_generated' },
  ],
  prohibitedClaims: [
    { id: 'guaranteed-job', pattern: 'guarantee[ds]?\\s+(a\\s+)?job', reason: 'Never guarantee employment outcomes.' },
    { id: 'accredited', pattern: '\\baccredited\\b', reason: 'Colaberry is not an accredited institution; do not claim it.' },
  ],
  protectedTerms: [
    { canonical: 'Colaberry', rejectedForms: ['Cola Berry', 'ColaBerry', 'Colaberri', 'Cola-berry'], caseSensitive: true },
  ],
  audienceExclusions: ['under-18'],
  allowedLinkDomains: ['colaberry.com', 'colaberry.ai'],
  requiredApprovers: [{ role: 'brand_owner', forContent: ['pricing', 'paid'] }],
};

const CLEAN: ContentUnderReview = {
  body: 'Join the Colaberry free class this Thursday. Reserve your seat.',
  disclosure: '',
  links: ['https://learn.colaberry.com/free-class'],
  isPaid: false,
  aiGenerated: false,
  hasOffer: true,
  kinds: [],
};

describe('clean content passes', () => {
  it('reports ok with no violations', () => {
    const r = checkContent(CLEAN, RULES);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
    expect(r.rulesVersion).toBe(3);
  });
});

describe('a prohibited claim is caught', () => {
  it('blocks a guaranteed-job claim, with the rule id so the RULE can be found', () => {
    const r = checkContent({ ...CLEAN, body: 'We guarantee a job within 90 days.' }, RULES);
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.kind === 'prohibited_claim')!;
    expect(v.ruleId).toBe('guaranteed-job');
    expect(v.severity).toBe('block');
    expect(v.message).toMatch(/Never guarantee/);
  });

  it('matches case-insensitively', () => {
    expect(checkContent({ ...CLEAN, body: 'GUARANTEED JOB placement' }, RULES).ok).toBe(false);
  });

  it('a malformed pattern is reported against the rule rather than silently skipped', () => {
    // Skipping would let the claim it was meant to catch sail through with no trace.
    const rules = { ...RULES, prohibitedClaims: [{ id: 'broken', pattern: '(unclosed', reason: 'x' }] };
    const r = checkContent(CLEAN, rules);
    expect(r.ok).toBe(false);
    expect(r.violations[0].message).toMatch(/invalid pattern/);
  });
});

describe('a missing required disclosure is caught', () => {
  it('paid content without #ad is blocked', () => {
    const r = checkContent({ ...CLEAN, isPaid: true }, RULES);
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.kind === 'missing_disclosure')!;
    expect(v.ruleId).toBe('paid-disclosure');
    expect(v.message).toMatch(/#ad/);
  });

  it('the disclosure may live in the disclosure field OR the body', () => {
    expect(checkContent({ ...CLEAN, isPaid: true, disclosure: '#ad' }, RULES).ok).toBe(true);
    expect(checkContent({ ...CLEAN, isPaid: true, body: `${CLEAN.body} #ad` }, RULES).ok).toBe(true);
  });

  it('a disclosure that does not apply is not demanded', () => {
    // Not paid, not AI: neither disclosure is required.
    expect(checkContent(CLEAN, RULES).violations.filter((v) => v.kind === 'missing_disclosure')).toEqual([]);
  });
});

describe('a protected-term misspelling is caught', () => {
  // Two categories, deliberately kept apart. A SPELLING error - different letters - blocks.
  // A CASE error - the right letters, wrong capitalisation - warns. "ColaBerry" is in the
  // rejected list as data, but its letters match the canonical form, so the rule treats it as
  // the case error it is rather than the spelling error it is not.
  it.each(['Cola Berry', 'Colaberri', 'Cola-berry'])('BLOCKS the misspelling "%s"', (bad) => {
    const r = checkContent({ ...CLEAN, body: `Welcome to ${bad}.` }, RULES);
    expect(r.ok).toBe(false);
    const v = r.violations.find((x) => x.kind === 'protected_term')!;
    expect(v.severity).toBe('block');
    expect(v.message).toMatch(/use "Colaberry"/);
  });

  it.each(['colaberry', 'ColaBerry', 'COLABERRY'])('WARNS on the case variant "%s" without blocking', (variant) => {
    const r = checkContent({ ...CLEAN, body: `Welcome to ${variant}.` }, RULES);
    const v = r.violations.find((x) => x.kind === 'protected_term')!;
    expect(v).toBeDefined();
    expect(v.severity).toBe('warn');
    expect(v.message).toMatch(new RegExp(`"${variant}" should be written "Colaberry"`));
    // A warning alone does not block.
    expect(r.ok).toBe(true);
    // And it is reported ONCE, not once by the rejected-forms rule and again by the case rule.
    expect(r.violations.filter((x) => x.kind === 'protected_term')).toHaveLength(1);
  });

  it('does not flag the canonical form', () => {
    expect(checkContent(CLEAN, RULES).violations.filter((v) => v.kind === 'protected_term')).toEqual([]);
  });

  it('does not flag a longer word that merely contains a rejected form', () => {
    // Word boundaries. "ColaBerryville" is not "ColaBerry" any more than "cat" is "category".
    const rules = { ...RULES, protectedTerms: [{ canonical: 'Colaberry', rejectedForms: ['ColaBerry'], caseSensitive: false }] };
    expect(checkContent({ ...CLEAN, body: 'ColaBerryville is a place.' }, rules).ok).toBe(true);
  });
});

describe('rules are read from data, not module constants', () => {
  it('the SAME content passes under one rule set and fails under another', () => {
    // The property "read from data" actually means: the verdict depends on what is handed in.
    const content = { ...CLEAN, body: 'Our accredited programme.' };
    expect(checkContent(content, RULES).ok).toBe(false);
    const permissive: BrandGovernanceRules = { ...RULES, prohibitedClaims: [] };
    expect(checkContent(content, permissive).ok).toBe(true);
  });

  it('the module source declares no rule constants', () => {
    // The existing brandComplianceService hardcodes BANNED_PHRASES as a module constant. This
    // module must not: a constant cannot differ per brand or change without a deploy.
    const src = fs.readFileSync(path.join(__dirname, '..', 'brandGovernance.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/const\s+(PROHIBITED|BANNED|PROTECTED|REQUIRED|ALLOWED)[A-Z_]*\s*[:=]/);
    // And no literal brand vocabulary either.
    expect(code).not.toMatch(/'Colaberry'/);
  });

  it('carries the rules version through, so a verdict can be tied to the rules that produced it', () => {
    expect(checkContent(CLEAN, { ...RULES, version: 7 }).rulesVersion).toBe(7);
  });
});

describe('link domains', () => {
  it('blocks a link off the allowed list', () => {
    const r = checkContent({ ...CLEAN, links: ['https://evil.test/x'] }, RULES);
    expect(r.violations.find((v) => v.kind === 'link_domain')!.severity).toBe('block');
  });

  it('allows a subdomain of an allowed domain', () => {
    expect(checkContent({ ...CLEAN, links: ['https://learn.colaberry.com/x'] }, RULES).ok).toBe(true);
  });

  it('does NOT allow a domain that merely ends with an allowed one', () => {
    // colaberry.com.evil.test ends with "colaberry.com" as a string. It is not under it.
    const r = checkContent({ ...CLEAN, links: ['https://colaberry.com.evil.test/x'] }, RULES);
    expect(r.ok).toBe(false);
  });

  it('blocks a relative or malformed link rather than passing it', () => {
    expect(checkContent({ ...CLEAN, links: ['/relative'] }, RULES).ok).toBe(false);
  });
});

describe('AI provenance (spec 8.4)', () => {
  const ai = { ...CLEAN, aiGenerated: true, disclosure: 'Drafted with AI assistance' };

  it('AI content with full provenance and human approval passes', () => {
    expect(checkContent({ ...ai, ai: { model: 'claude-opus-5', promptVersion: 'p3', templateVersion: 't1', humanApproved: true } }, RULES).ok).toBe(true);
  });

  it('AI content without a recorded model/prompt is blocked', () => {
    const r = checkContent({ ...ai, ai: { model: null, promptVersion: null, templateVersion: null, humanApproved: true } }, RULES);
    expect(r.violations.some((v) => v.kind === 'ai_provenance')).toBe(true);
  });

  it('AI content a human has not approved is blocked', () => {
    const r = checkContent({ ...ai, ai: { model: 'm', promptVersion: 'p', templateVersion: 't', humanApproved: false } }, RULES);
    expect(r.violations.some((v) => v.kind === 'ai_unapproved')).toBe(true);
    expect(r.ok).toBe(false);
  });
});

describe('approvers and CTAs', () => {
  it('routes paid or pricing content to the brand owner', () => {
    expect(checkContent({ ...CLEAN, kinds: ['pricing'] }, RULES).requiredApproverRoles).toEqual(['brand_owner']);
    expect(checkContent(CLEAN, RULES).requiredApproverRoles).toEqual([]);
  });

  it('warns when an offer uses no approved CTA', () => {
    const r = checkContent({ ...CLEAN, body: 'Sign up now for the Colaberry class.' }, RULES);
    const v = r.violations.find((x) => x.kind === 'unapproved_cta')!;
    expect(v.severity).toBe('warn');
  });

  it('reports EVERY violation, not the first', () => {
    const r = checkContent({ ...CLEAN, body: 'Cola Berry guarantees a job. Sign up.', isPaid: true, links: ['https://evil.test'] }, RULES);
    const kinds = r.violations.map((v) => v.kind);
    expect(kinds).toEqual(expect.arrayContaining(['protected_term', 'prohibited_claim', 'missing_disclosure', 'link_domain', 'unapproved_cta']));
  });
});
