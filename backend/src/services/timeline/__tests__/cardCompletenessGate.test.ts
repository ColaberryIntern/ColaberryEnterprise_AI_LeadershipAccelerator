/**
 * cardCompletenessGate — the STRUCTURAL half of "is this a finished card?".
 *
 * The cases below are drawn from the three cards that actually shipped truncated
 * in August 2026 and from the rejected regeneration attempts that followed. The
 * second half of each describe block is the false-positive discipline: real card
 * bodies, including the ones an earlier naive audit flagged wrongly, must pass.
 */
import {
  checkCardCompleteness,
  assertCardComplete,
  visibleText,
  TYPE_REQUIRED_MARKERS,
} from '../cardCompletenessGate';
import { INTEL_FORMATS } from '../../../seeds/intelCardFormats';

/** A complete, well-formed card — the baseline every negative case mutates. */
const GOOD = {
  title: 'Prompt Lab: Constraint Stacking',
  summary: 'Practise layering constraints onto a single prompt.',
  body_html: '<h4>Warm up</h4><p>Start from the base prompt and add one constraint at a time, then compare the two outputs side by side.</p>',
  questions: ['Which constraint changed the output most?'],
  reflection: 'Where did the model stop following your instructions?',
};

describe('checkCardCompleteness — happy path', () => {
  it('accepts a complete, well-formed card', () => {
    expect(checkCardCompleteness(GOOD)).toEqual({ ok: true, failures: [], warnings: [] });
  });

  it('accepts a body that omits optional end tags, which HTML allows', () => {
    const v = checkCardCompleteness({ ...GOOD, body_html: '<ul><li>First step of the setup<li>Second step of the setup</ul>' });
    expect(v.ok).toBe(true);
  });

  it('accepts a body carrying a <style> block, as the intel bands do', () => {
    const body = '<style>.ip p{margin:0} .a > .b{color:red}</style><div class="ip"><p>The four layer model scores every domain on crawlability.</p></div>';
    expect(checkCardCompleteness({ ...GOOD, body_html: body }).ok).toBe(true);
  });
});

describe('checkCardCompleteness — the failures that reached students', () => {
  it('THE CASE: Week 8 Setup Lab died at `<li>Click on the "` — unclosed list plus a dangling open quote', () => {
    const v = checkCardCompleteness({
      ...GOOD,
      body_html: '<h4>Install the extension</h4><ol><li>Open your browser settings and find the extensions panel<li>Click on the "',
    });
    expect(v.ok).toBe(false);
    expect(v.failures).toEqual(expect.arrayContaining(['unclosed_tag:ol', 'ends_mid_markup', 'dangling_open_quote']));
  });

  it('THE CASE: a clean-stop repair ended at "Go to the " — tags unclosed, prose dangling on a function word', () => {
    const v = checkCardCompleteness({
      ...GOOD,
      body_html: '<h4>Get set up</h4><ol><li>Create the workspace folder you will use all week<li>Go to the ',
    });
    expect(v.ok).toBe(false);
    expect(v.failures).toEqual(expect.arrayContaining(['unclosed_tag:ol', 'ends_mid_markup', 'dangling_prose:the']));
  });

  it('THE CASE: Week 4 Prompt Lab died inside an unclosed <pre>', () => {
    const v = checkCardCompleteness({
      ...GOOD,
      body_html: '<h4>Grade your own prompt</h4><pre>What criteria should a prompt meet to be considered ',
    });
    expect(v.ok).toBe(false);
    expect(v.failures).toContain('unclosed_tag:pre');
  });

  it('THE CASE: the whitespace derail — thousands of spaces where prose should be', () => {
    const v = checkCardCompleteness({ ...GOOD, body_html: `<p>Only 24.7% of domains scored${' '.repeat(4000)}</p>` });
    expect(v.ok).toBe(false);
    expect(v.failures).toContain('whitespace_derail');
  });

  it('THE CASE: the empty content object a swallowed JSON.parse produces', () => {
    expect(checkCardCompleteness({})).toEqual({ ok: false, failures: ['empty_content'], warnings: [] });
    expect(checkCardCompleteness({ title: '', summary: '', body_html: '', questions: [] }).failures).toContain('empty_content');
  });

  it('BOUNDARY: null, a string and an array are all empty_content, never a card', () => {
    expect(checkCardCompleteness(null).failures).toContain('empty_content');
    expect(checkCardCompleteness('<p>hi</p>').failures).toContain('empty_content');
    expect(checkCardCompleteness([GOOD]).failures).toContain('empty_content');
  });

  it('rejects a card with a title but no body, and can be told not to', () => {
    expect(checkCardCompleteness({ title: 'A card' }).failures).toContain('missing_body_html');
    expect(checkCardCompleteness({ title: 'A card' }, { requireBodyHtml: false }).ok).toBe(true);
  });

  it('rejects a body cut off inside a tag', () => {
    const v = checkCardCompleteness({ ...GOOD, body_html: '<p>The first layer is crawlability, which decides whether the page is seen at all.</p><div class="fo' });
    expect(v.ok).toBe(false);
    expect(v.failures).toContain('cut_off_mid_tag');
  });

  it('rejects a body that is technically well-formed but too thin to be a lesson', () => {
    expect(checkCardCompleteness({ ...GOOD, body_html: '<p>Read it.</p>' }).failures).toContain('body_text_too_short');
  });
});

describe('checkCardCompleteness — false-positive discipline', () => {
  // An audit of all 977 timeline cards found 363 raw hits on "tail lacks terminal
  // punctuation" of which 360 were false positives. These are those tails.
  it.each([
    ['a Source/Confidence footer', '<div class="foot">Source: Anthropic Engineering<span class="conf">Confidence: High</span></div>'],
    ['a repository link', '<p>The reference implementation is small enough to read in one sitting.</p><a href="https://example.com">View Repository</a>'],
    ['an emoji tail', '<p>You have everything you need for the build session this week.</p><p>Ship it 🚀</p>'],
    ['a closing quotation', '<p>The prompt that worked ended with the phrase "return strict json" every single time.</p>'],
  ])('accepts a real card tail: %s', (_label, tail) => {
    const v = checkCardCompleteness({ ...GOOD, body_html: `<h4>Wrap up</h4>${tail}` });
    expect(v.failures).toEqual([]);
    expect(v.ok).toBe(true);
  });

  it('treats an EXTRA closing tag as a warning, not a failure (27 of 29 audit hits were exactly this)', () => {
    const v = checkCardCompleteness({ ...GOOD, body_html: '<div><p>The extra close below is untidy but it is not truncation.</p></div></div>' });
    expect(v.ok).toBe(true);
    expect(v.warnings).toContain('stray_close_tag:div');
  });

  it('does not mistake a ">" inside an attribute or inside CSS for the end of a tag', () => {
    const body = '<style>.ip > p{margin:0}</style><div title="a > b"><p>Nested selectors are ordinary CSS and must not confuse the scanner.</p></div>';
    expect(checkCardCompleteness({ ...GOOD, body_html: body }).ok).toBe(true);
  });

  it('accepts void and self-closing elements without demanding an end tag', () => {
    const body = '<p>Line one of the setup instructions<br>Line two of the setup instructions</p><img src="x.png" alt="diagram">';
    expect(checkCardCompleteness({ ...GOOD, body_html: body }).ok).toBe(true);
  });
});

describe('per-type required markers', () => {
  const intelBody = '<div class="ip"><p>Only 24.7% of the 3,200 domains sampled scored above the readability floor.</p><div class="foot">Source: Ahrefs<span class="conf">Confidence: Medium</span></div></div>';

  it('accepts an intel card that carries its Source/Confidence footer', () => {
    expect(checkCardCompleteness({ ...GOOD, body_html: intelBody }, { type: 'build_breakdown' }).ok).toBe(true);
  });

  it('THE CASE: a Build Breakdown that dropped the Source/Confidence footer is rejected', () => {
    const v = checkCardCompleteness(
      { ...GOOD, body_html: '<div class="ip"><p>The four layer model describes how a crawler, a parser, a ranker and a renderer each see the page.</p></div>' },
      { type: 'build_breakdown' },
    );
    expect(v.ok).toBe(false);
    expect(v.failures).toEqual(expect.arrayContaining(['missing_marker:source', 'missing_marker:confidence']));
  });

  it('rejects a prompt_lab card with no <pre> prompt block — the card IS the prompts', () => {
    const v = checkCardCompleteness(
      { ...GOOD, body_html: '<h4>Constraint stacking</h4><p>Add one constraint at a time and compare what changes in the output.</p>' },
      { type: 'prompt_lab' },
    );
    expect(v.failures).toContain('missing_marker:pre');
  });

  it('leaves a type with no marker rule alone', () => {
    expect(checkCardCompleteness(GOOD, { type: 'warmup' }).ok).toBe(true);
    expect(checkCardCompleteness(GOOD, { type: null }).ok).toBe(true);
  });

  // Drift pin: the footer rule claims to cover every Intelligence Pipeline type.
  // If a type is added to INTEL_FORMATS without a marker rule, this fails.
  it('covers every Intelligence Pipeline type declared in intelCardFormats', () => {
    for (const slug of Object.keys(INTEL_FORMATS)) {
      expect(TYPE_REQUIRED_MARKERS[slug]?.map((m) => m.code)).toEqual(
        expect.arrayContaining(['missing_marker:source', 'missing_marker:confidence']),
      );
    }
  });
});

describe('visibleText', () => {
  it('strips tags, style blocks, comments and entities', () => {
    expect(visibleText('<style>p{color:red}</style><!-- note --><p>Hello&nbsp;&amp; welcome</p>')).toBe('Hello & welcome');
  });

  it('BOUNDARY: is safe on an empty body and on a never-closed trailing tag', () => {
    expect(visibleText('')).toBe('');
    expect(visibleText('<p>Go to the <a href="htt')).toBe('Go to the');
  });
});

describe('assertCardComplete', () => {
  it('returns the verdict on a complete card', () => {
    expect(assertCardComplete(GOOD).ok).toBe(true);
  });

  it('throws a classified error carrying the failure codes', () => {
    try {
      assertCardComplete({ ...GOOD, body_html: '<ol><li>Go to the ' });
      throw new Error('expected assertCardComplete to throw');
    } catch (err: any) {
      expect(err.error_class).toBe('IncompleteGeneration');
      expect(err.status).toBe(502);
      expect(err.failures).toEqual(expect.arrayContaining(['unclosed_tag:ol']));
    }
  });
});
