/**
 * C6.9's brief gate.
 *
 * The recommendation C6.9 makes is "do not build the generator" — but the gate ships either
 * way, because it is what stops an unsourced line reaching a buyer conversation, and it
 * works the same whether a person or a model wrote the brief.
 *
 * The ticket's named failure is "generating plausible-sounding account facts". Every block
 * below is one way that failure gets through: a claim with no source, a source with no date,
 * a section quietly missing, a figure about us that no registry row supports, and two briefs
 * that could be swapped between accounts.
 */
const {
  SECTIONS,
  assertEveryClaimIsSourced,
  assertAbsencesAreExplicit,
  assertOurClaimsMatchRegistry,
  assertNotInterchangeable,
  validateBriefs,
} = require('../../../../../scripts/artifacts/tickets/c69Guards');

/** A brief that passes everything, used as the base each test breaks one way. */
function goodBrief(over = {}) {
  const sourced = (text) => ({
    text,
    source: 'https://example.edu/news/ai-initiative',
    seen: '2026-10-18',
    confidence: 'HIGH',
  });
  return {
    account: 'Example University',
    aiActivity: sourced('Launched an AI literacy requirement for all staff.'),
    whyNow: sourced('The provost named it a priority for the spring term.'),
    likelyBuyer: sourced('Dean of Continuing Education, named on the CE site.'),
    likelyInitiative: sourced('A workforce upskilling program announced in September.'),
    relevantProof: { text: 'A commit history a stranger can open without an account.' },
    opening: sourced('Your provost called AI literacy a spring priority.'),
    risk: { text: 'They may already have an internal program.' },
    ...over,
  };
}

describe('the schema', () => {
  it('names the seven sections the ticket asks for', () => {
    expect(SECTIONS).toHaveLength(7);
    expect(SECTIONS.map((s) => s.key)).toEqual([
      'aiActivity', 'whyNow', 'likelyBuyer', 'likelyInitiative',
      'relevantProof', 'opening', 'risk',
    ]);
  });

  it('requires a source on the sections that assert something about the ACCOUNT', () => {
    const sourced = SECTIONS.filter((s) => s.sourced).map((s) => s.key);
    expect(sourced).toContain('aiActivity');
    expect(sourced).toContain('whyNow');
    expect(sourced).toContain('opening');
    // These two are about US, so a registry claim covers them, not an external URL.
    expect(sourced).not.toContain('relevantProof');
    expect(sourced).not.toContain('risk');
  });
});

describe('a claim about the account needs a source, a date and a confidence', () => {
  it('accepts a fully sourced brief', () => {
    expect(assertEveryClaimIsSourced(goodBrief())).toBe(true);
  });

  it('refuses a claim with no source URL', () => {
    const b = goodBrief({ aiActivity: { text: 'They are doing a lot with AI.' } });
    expect(() => assertEveryClaimIsSourced(b)).toThrow(/no source URL/);
  });

  it('refuses a source that is not a URL', () => {
    const b = goodBrief({
      whyNow: { text: 'Budget cycle.', source: 'someone told me', seen: '2026-10-18', confidence: 'MED' },
    });
    expect(() => assertEveryClaimIsSourced(b)).toThrow(/no source URL/);
  });

  it('refuses a source with no date it was read', () => {
    const b = goodBrief({
      opening: { text: 'A thing.', source: 'https://example.edu/x', confidence: 'HIGH' },
    });
    expect(() => assertEveryClaimIsSourced(b)).toThrow(/no date it was read/);
  });

  it('refuses a line with no confidence level', () => {
    const b = goodBrief({
      likelyBuyer: { text: 'The dean.', source: 'https://example.edu/ce', seen: '2026-10-18' },
    });
    expect(() => assertEveryClaimIsSourced(b)).toThrow(/no confidence level/);
  });

  it('names the account and the section, so the error is actionable', () => {
    const b = goodBrief({ aiActivity: { text: 'Unsourced.' } });
    expect(() => assertEveryClaimIsSourced(b)).toThrow(/Example University: aiActivity/);
  });
});

describe('an absent section must say it is absent', () => {
  it('refuses a silently omitted section', () => {
    const b = goodBrief();
    delete b.whyNow;
    expect(() => assertAbsencesAreExplicit(b)).toThrow(/whyNow is absent/);
  });

  it('accepts an explicit unavailable with a reason', () => {
    const b = goodBrief({ whyNow: { available: false, reason: 'Nothing published since 2024.' } });
    expect(assertAbsencesAreExplicit(b)).toBe(true);
  });

  it('refuses an unavailable with no reason', () => {
    const b = goodBrief({ whyNow: { available: false } });
    expect(() => assertAbsencesAreExplicit(b)).toThrow(/unavailable with no reason/);
  });

  it('does not demand a source for a section marked unavailable', () => {
    const b = goodBrief({ whyNow: { available: false, reason: 'Nothing published.' } });
    expect(assertEveryClaimIsSourced(b)).toBe(true);
  });
});

describe('figures about us must come from the claim registry', () => {
  const REGISTRY = ['8k+ data students', '2,500+ certified', '12 weeks'];

  it('allows a figure that matches a registry wording', () => {
    const b = goodBrief({ relevantProof: { text: 'We have 2,500+ certified.' } });
    expect(assertOurClaimsMatchRegistry(b, REGISTRY)).toBe(1);
  });

  it('refuses a figure with no registry row', () => {
    const b = goodBrief({ relevantProof: { text: 'We have placed 9,999 people.' } });
    expect(() => assertOurClaimsMatchRegistry(b, REGISTRY)).toThrow(/No row, no claim/);
  });

  it('refuses an invented percentage', () => {
    const b = goodBrief({ opening: { ...goodBrief().opening, text: 'We cut cost by 47%.' } });
    expect(() => assertOurClaimsMatchRegistry(b, REGISTRY)).toThrow(/47%/);
  });

  it('ignores figures in the sourced account sections, which carry their own URL', () => {
    const b = goodBrief({
      aiActivity: { ...goodBrief().aiActivity, text: 'They trained 4,000 staff.' },
    });
    expect(assertOurClaimsMatchRegistry(b, REGISTRY)).toBe(0);
  });
});

describe('two briefs that could be swapped are a template', () => {
  it('accepts genuinely different openings', () => {
    const a = goodBrief({ account: 'A', opening: { ...goodBrief().opening, text: 'Your provost named AI literacy a spring priority.' } });
    const b = goodBrief({ account: 'B', opening: { ...goodBrief().opening, text: 'The mechatronics pathway you announced needs instructors.' } });
    expect(assertNotInterchangeable([a, b])).toBe(2);
  });

  it('refuses two openings that share most of their vocabulary', () => {
    const text = 'We help institutions like yours build enterprise capability with modern tooling.';
    const a = goodBrief({ account: 'A', opening: { ...goodBrief().opening, text } });
    const b = goodBrief({ account: 'B', opening: { ...goodBrief().opening, text } });
    expect(() => assertNotInterchangeable([a, b])).toThrow(/One is a template/);
  });

  it('names both accounts in the error', () => {
    const text = 'We help institutions like yours build enterprise capability with modern tooling.';
    const a = goodBrief({ account: 'Alpha College', opening: { ...goodBrief().opening, text } });
    const b = goodBrief({ account: 'Beta State', opening: { ...goodBrief().opening, text } });
    expect(() => assertNotInterchangeable([a, b])).toThrow(/Alpha College and Beta State/);
  });
});

describe('validateBriefs runs every gate', () => {
  it('passes a clean set', () => {
    const a = goodBrief({ account: 'A', opening: { ...goodBrief().opening, text: 'Your provost named AI literacy a spring priority.' } });
    const b = goodBrief({ account: 'B', opening: { ...goodBrief().opening, text: 'The mechatronics pathway you announced needs instructors.' } });
    expect(validateBriefs([a, b], ['2,500+ certified'])).toBe(2);
  });

  it('refuses a brief with no account name', () => {
    const b = goodBrief();
    delete b.account;
    expect(() => validateBriefs([b])).toThrow(/no account name/);
  });

  it('surfaces the first real failure rather than passing silently', () => {
    const b = goodBrief({ aiActivity: { text: 'Unsourced claim.' } });
    expect(() => validateBriefs([b])).toThrow(/no source URL/);
  });
});
