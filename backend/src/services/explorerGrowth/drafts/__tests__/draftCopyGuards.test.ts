import { BANNED_COPY_RULES, FREE_WORD_RULE } from '../../../content/bannedCopyRule';
import {
  CopyRulesAbsentError,
  absolutizeHref,
  absolutizeHrefs,
  bannedCopyIssues,
  emailLinkIssues,
  findBannedCopy,
  isSafeToAdvertise,
} from '../draftCopyGuards';

/**
 * The fixtures below are VERBATIM production output, not invented copy.
 *
 * They are the 2026-10-31 live render — the first Explorer drafts that have ever existed,
 * possible only once `scheduled_emails.id` was supplied. Reading them is what found both
 * defects, so the tests assert against the real strings rather than a convenient paraphrase.
 * A fixture written to suit the guard proves the guard matches the fixture.
 */

/** Draft 1 of 12, exactly as persisted. Carries BOTH defects at once. */
const REAL_BODY_WITH_BOTH_DEFECTS =
  '<p>Hi Taiwo,</p><p>I hope this message finds you well! As a graduate of the Colaberry '
  + "Data Analytics/BI bootcamp, you're already equipped with a solid foundation.</p>"
  + '<p>To get started, I recommend checking out the <strong><a '
  + 'href="/portal/runtime/0f97ff01-ffbd-4ec4-a8f0-3b6949777464">Welcome to Your Free AI '
  + 'Preview</a></strong>. This first-step lesson is designed to help you explore the '
  + 'potential of AI.</p><p>If you have any questions, feel free to <strong><a '
  + 'href="https://enterprise.colaberry.ai/ai-architect">book a strategy call</a></strong> '
  + 'with us.</p>';

/** Draft 2 of 12: clean links, still carries the banned word. */
const REAL_BODY_ABSOLUTE_LINKS_ONLY =
  '<p>Hi Asnake,</p><p>I wanted to check in and see if you had a chance to explore the '
  + '<strong>Welcome to Your Free AI Preview</strong> lesson.</p><p>When you are ready, you '
  + 'can <a href="https://enterprise.colaberry.ai/ai-architect">book a strategy call</a> or '
  + 'explore more on our <a href="https://enterprise.colaberry.ai">main site</a>.</p>';

const BASE = 'https://enterprise.colaberry.ai';

describe('findBannedCopy', () => {
  it('finds the word in the real production title that caused this change', () => {
    const hits = findBannedCopy('Welcome to Your Free AI Preview');
    expect(hits).toEqual([{ rule_id: 'tac-807-172-d-free', text: 'Free' }]);
  });

  it('preserves the case as written, so the report stays auditable', () => {
    // A real active asset title, measured in production.
    expect(findBannedCopy('The Easiest FREE AI Tools for Beginners in 2026')[0]?.text)
      .toBe('FREE');
  });

  it('does not match words that merely begin with it', () => {
    expect(findBannedCopy('freedom, freely, freelance, freeTier')).toEqual([]);
  });

  it('DOES match a hyphenated compound, which is the deliberate choice', () => {
    // "Efficient Reasoning with Training-Free Contrastive Decoding" is a real asset title.
    // A hyphen is a word boundary, so this is reported. The asset is then EXCLUDED from
    // advertising rather than rewritten, because "Training-" is a mangled citation and the
    // term is not an advertisement at all. See the module header.
    expect(findBannedCopy('Training-Free Contrastive Decoding')).toHaveLength(1);
  });

  it('reports each distinct spelling once, not once per occurrence', () => {
    expect(findBannedCopy('free Free FREE free')).toHaveLength(1);
  });

  it('throws rather than reporting clean when given no rules', () => {
    // Zero rules means UNCHECKED. Returning [] here would be a silent pass.
    expect(() => findBannedCopy('Free AI Preview', [])).toThrow(CopyRulesAbsentError);
  });

  it('CONTROL: the real bodies are not accidentally empty fixtures', () => {
    expect(REAL_BODY_WITH_BOTH_DEFECTS.length).toBeGreaterThan(300);
    expect(REAL_BODY_ABSOLUTE_LINKS_ONLY.length).toBeGreaterThan(300);
  });

  it('flags both real bodies, which is why 12 of 12 drafts were non-compliant', () => {
    expect(findBannedCopy(REAL_BODY_WITH_BOTH_DEFECTS)).toHaveLength(1);
    expect(findBannedCopy(REAL_BODY_ABSOLUTE_LINKS_ONLY)).toHaveLength(1);
  });
});

describe('bannedCopyIssues', () => {
  it('names the authority and both approved phrasings', () => {
    const [issue] = bannedCopyIssues('Welcome to Your Free AI Preview');
    expect(issue).toContain('tac-807-172-d-free');
    expect(issue).toContain('40 TAC 807.172(d)');
    for (const alt of FREE_WORD_RULE.approvedAlternatives) {
      expect(issue).toContain(alt);
    }
  });

  it('is empty on compliant copy', () => {
    expect(bannedCopyIssues('Welcome to your AI Preview. No card needed.')).toEqual([]);
  });
});

describe('isSafeToAdvertise', () => {
  it('refuses an asset whose TITLE carries the word', () => {
    expect(isSafeToAdvertise({ title: 'Welcome to Your Free AI Preview', summary: 'ok' }))
      .toBe(false);
  });

  it('refuses an asset whose SUMMARY carries it even when the title is clean', () => {
    // All 11 affected production rows carry the word in BOTH fields, so a title-only check
    // would have passed every one of them on the summary.
    expect(isSafeToAdvertise({ title: 'AI Preview', summary: 'A real taste. Free.' }))
      .toBe(false);
  });

  it('allows a clean asset', () => {
    expect(isSafeToAdvertise({ title: 'Intro to Large Language Models', summary: 'A primer.' }))
      .toBe(true);
  });

  it('treats absent fields as clean rather than throwing', () => {
    expect(isSafeToAdvertise({ title: null, summary: undefined })).toBe(true);
  });

  it('throws on an empty rule set instead of excluding every asset', () => {
    // The alternative failure mode is worse than a throw: returning false here would take
    // the whole feature down over a wiring mistake.
    expect(() => isSafeToAdvertise({ title: 'x' }, [])).toThrow(CopyRulesAbsentError);
  });
});

describe('absolutizeHref', () => {
  it('resolves the exact relative path found in production', () => {
    expect(absolutizeHref('/portal/runtime/0f97ff01-ffbd-4ec4-a8f0-3b6949777464', BASE))
      .toBe(`${BASE}/portal/runtime/0f97ff01-ffbd-4ec4-a8f0-3b6949777464`);
  });

  it('does not double the slash when the base carries a trailing one', () => {
    expect(absolutizeHref('/a', 'https://x.test/')).toBe('https://x.test/a');
    expect(absolutizeHref('/a', 'https://x.test///')).toBe('https://x.test/a');
  });

  it.each([
    ['https://enterprise.colaberry.ai/ai-architect'],
    ['http://example.test/p'],
    ['mailto:ali@colaberry.com'],
    ['tel:+15551234567'],
    ['#section'],
    ['//cdn.example.test/img.png'],
  ])('leaves %s untouched', (href) => {
    expect(absolutizeHref(href, BASE)).toBe(href);
  });

  it('returns null rather than guessing for a non-root relative path', () => {
    expect(absolutizeHref('portal/runtime/abc', BASE)).toBeNull();
    expect(absolutizeHref('   ', BASE)).toBeNull();
  });
});

describe('absolutizeHrefs', () => {
  it('fixes the real body and reports exactly how many links it changed', () => {
    const result = absolutizeHrefs(REAL_BODY_WITH_BOTH_DEFECTS, BASE);
    // The count is the control: an output-only assertion passes identically when the
    // function matched nothing at all.
    expect(result.rewritten).toBe(1);
    expect(result.unresolvable).toEqual([]);
    expect(result.html).toContain(
      `href="${BASE}/portal/runtime/0f97ff01-ffbd-4ec4-a8f0-3b6949777464"`,
    );
    expect(result.html).not.toContain('href="/portal/runtime/');
    // The already-absolute link in the same body is left exactly as it was.
    expect(result.html).toContain('href="https://enterprise.colaberry.ai/ai-architect"');
  });

  it('is a no-op on a body whose links are already absolute', () => {
    const result = absolutizeHrefs(REAL_BODY_ABSOLUTE_LINKS_ONLY, BASE);
    expect(result.rewritten).toBe(0);
    expect(result.unresolvable).toEqual([]);
    expect(result.html).toBe(REAL_BODY_ABSOLUTE_LINKS_ONLY);
  });

  it('handles single-quoted attributes and odd spacing', () => {
    const result = absolutizeHrefs("<a href = '/x'>t</a>", BASE);
    expect(result.rewritten).toBe(1);
    expect(result.html).toContain(`'${BASE}/x'`);
  });

  it('reports an unfixable link instead of inventing a destination', () => {
    const result = absolutizeHrefs('<a href="portal/runtime/abc">t</a>', BASE);
    expect(result.rewritten).toBe(0);
    expect(result.unresolvable).toEqual(['portal/runtime/abc']);
    expect(result.html).toBe('<a href="portal/runtime/abc">t</a>');
  });

  it('rewrites every relative link, not just the first', () => {
    const result = absolutizeHrefs('<a href="/a">1</a><a href="/b">2</a>', BASE);
    expect(result.rewritten).toBe(2);
  });
});

describe('emailLinkIssues', () => {
  it('is empty for the real body, because its one relative link is fixable', () => {
    expect(emailLinkIssues(REAL_BODY_WITH_BOTH_DEFECTS, BASE)).toEqual([]);
  });

  it('explains why a relative link is wrong in an email', () => {
    const [issue] = emailLinkIssues('<a href="portal/x">t</a>', BASE);
    expect(issue).toContain('portal/x');
    expect(issue).toContain('absolute');
  });
});

describe('the rule set this module is wired to', () => {
  it('is non-empty, or every guard above throws in production', () => {
    expect(BANNED_COPY_RULES.length).toBeGreaterThan(0);
    expect(BANNED_COPY_RULES).toContain(FREE_WORD_RULE);
  });
});
