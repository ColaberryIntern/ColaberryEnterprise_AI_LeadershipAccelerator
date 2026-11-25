import { lintField, lintFields, tagObject, lintObjectAs, type FieldKind, type LintRule } from '../contentLint';

/** WL2.3: one positive and one negative control per rule, plus the two acceptance examples. */
const rules = (kind: FieldKind, text: string, ctx = {}): LintRule[] => lintField({ path: 'f', kind, text }, ctx).map((v) => v.rule);

describe('acceptance examples', () => {
  it('the known bad hook is rejected in every field kind', () => {
    // spec.json, WL2.3: the known bad hook.
    const hook = 'You can start building enterprise AI systems for $0';
    for (const k of ['onScreen', 'voiceover', 'caption', 'post', 'email'] as FieldKind[]) expect(rules(k, hook)).toContain('zero_price');
  });
  it('"1 in 5 shoppers" passes in voiceover and fails onScreen', () => {
    expect(rules('voiceover', '1 in 5 shoppers this week is an AI agent')).toEqual([]);
    expect(rules('onScreen', '1 in 5 shoppers is an AI')).toEqual(['on_screen_stat']);
  });
  it('an attendee name in a caption is rejected: full name, first name, last name, any case', () => {
    const ctx = { attendees: [{ name: 'Ana Ruiz', email: 'ana@x.com' }, { name: 'marcus', email: null }] };
    expect(rules('caption', 'Great question from ana ruiz tonight', ctx)).toEqual(['attendee_data']);
    expect(rules('caption', 'Great question from Ana tonight', ctx)).toEqual(['attendee_data']);
    expect(rules('caption', 'Thanks, Ruiz!', ctx)).toEqual(['attendee_data']);
    expect(rules('caption', 'Shout out to Marcus', ctx)).toEqual(['attendee_data']);
    expect(rules('caption', 'Great question from the chat tonight', ctx)).toEqual([]);
  });
});

describe('zero_price', () => {
  it.each(['Join free', 'no cost to you', 'No-charge seat', 'zero cost', 'only $0', '$ 0 today'])('rejects "%s"', (t) => { expect(rules('post', t)).toContain('zero_price'); });
  it.each(['Freedom to build', 'carefree', '$0.99 is a price', '$10 seats'])('allows "%s"', (t) => { expect(rules('voiceover', t)).not.toContain('zero_price'); });
});

describe('partnership and logo', () => {
  it.each(['An official Anthropic partner', 'in partnership with Claude', 'Powered by Anthropic', 'partnered with Anthropic', 'a partner of Anthropic', 'endorsed by Anthropic', 'Anthropic-certified course', 'certified by Anthropic'])('rejects "%s"', (t) => { expect(rules('post', t)).toContain('partnership'); });
  it('allows naming the tool plainly', () => { expect(rules('post', 'We build with Claude Code tonight')).toEqual([]); });
  it('rejects a logo in words and as an asset', () => {
    expect(rules('onScreen', 'Put the Claude logo top right')).toContain('anthropic_logo');
    expect(rules('asset', 'https://cdn.x.com/brand/anthropic-logo.svg')).toContain('anthropic_logo');
    expect(rules('asset', 'https://cdn.x.com/claude_mark.png')).toContain('anthropic_logo');
  });
  it('allows a Colaberry asset', () => { expect(rules('asset', 'https://cdn.x.com/colaberry-logo.svg')).toEqual([]); });
});

describe('on_screen_stat (onScreen only)', () => {
  it.each(['40% faster', 'half percent', '3 out of 4 teams', '$5 tool', '1,200 jobs', '2.5x more', '10k views', '121 layoffs'])('rejects "%s" on screen', (t) => {
    expect(rules('onScreen', t)).toContain('on_screen_stat');
    expect(rules('voiceover', t)).not.toContain('on_screen_stat');
  });
  it.each(['It Works While You Sleep', '3 skills, 1 assistant', 'Week 3', 'Week 12', 'Ep 12: the capstone', 'Session 10'])('allows "%s" on screen', (t) => { expect(rules('onScreen', t)).toEqual([]); });
});

describe('attendee_data', () => {
  const ctx = { attendees: [{ name: 'Ana', email: 'Ana.R@Example.com' }, { name: null, email: null }, { name: 'Li', email: '' }] };
  it('rejects an email in any public kind, in any case', () => {
    for (const k of ['onScreen', 'voiceover', 'caption', 'post'] as FieldKind[]) expect(rules(k, 'ping ana.r@example.com', ctx)).toContain('attendee_data');
  });
  it('a name matches as a whole word in any case, never inside another word', () => {
    expect(rules('post', 'Thanks Ana for asking', ctx)).toContain('attendee_data');
    expect(rules('post', 'thanks ANA for asking', ctx)).toContain('attendee_data');
    expect(rules('post', 'banana and an analysis', ctx)).toEqual([]);
  });
  it('a name that is an everyday word counts only as part of the full name', () => {
    const c = { attendees: [{ name: 'Will Grace', email: null }] };
    expect(rules('post', 'This will save you an hour', c)).toEqual([]);
    expect(rules('post', 'Thanks to will grace', c)).toContain('attendee_data');
  });
  it('names under 3 letters are ignored, and the 1:1 email may greet the reader', () => {
    expect(rules('post', 'Li said hi', ctx)).toEqual([]);
    expect(rules('email', 'Hi Ana, here is your recap', ctx)).toEqual([]);
  });
});

describe('earnings_claim', () => {
  it.each(['a six-figure job', 'a 6-figure job', 'earn up to $150k', 'Average salary jumps', 'makes $90,000 a year', '$45/hr roles', 'they pay $120,000'])('rejects "%s"', (t) => { expect(rules('voiceover', t)).toContain('earnings_claim'); });
  it('allows an approved Claim Registry wording', () => {
    const approved = 'Graduates earn $85,000 on average (registry CLM-X)';
    expect(rules('voiceover', approved, { approvedClaims: [approved] })).not.toContain('earnings_claim');
  });
  it('an approved wording exempts only itself, not the rest of the field', () => {
    const approved = 'Graduates earn $85,000 on average.';
    expect(rules('voiceover', `${approved} Others earn $200k a year.`, { approvedClaims: [approved] })).toContain('earnings_claim');
  });
  it('allows learning and earning a certificate', () => { expect(rules('voiceover', 'learn the skill and earn a badge')).toEqual([]); });
});

it('dash: em and en dashes are rejected outside assets', () => {
  expect(rules('caption', 'one — two')).toEqual(['dash']);
  expect(rules('caption', '2026–2027')).toContain('dash');
  expect(rules('caption', 'one - two')).toEqual([]);
});

it('tagObject keeps dotted paths and lets the caller decide each kind', () => {
  const plan = { thumbnail: { text: '50% off' }, script: { lines: ['Say 50% here'] }, notes: 'internal' };
  const fields = tagObject(plan, (p) => (p.startsWith('thumbnail') ? 'onScreen' : p.startsWith('script') ? 'voiceover' : null));
  expect(fields.map((f) => f.path)).toEqual(['thumbnail.text', 'script.lines[0]']);
  expect(lintFields(fields)).toEqual([{ field: 'thumbnail.text', rule: 'on_screen_stat', match: '50%' }]);
});

it('lintObjectAs lints a whole object as one kind and returns every violation', () => {
  const v = lintObjectAs({ a: 'free', b: ['x — y'] }, 'email');
  expect(v.map((x) => `${x.field}:${x.rule}`)).toEqual(['a:zero_price', 'b[0]:dash']);
});
