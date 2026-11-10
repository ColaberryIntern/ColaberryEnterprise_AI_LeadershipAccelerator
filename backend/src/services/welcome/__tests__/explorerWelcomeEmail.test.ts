import {
  EXPLORER_WELCOME_SUBJECT,
  FIRST_ASSIGNMENTS,
  buildExplorerWelcomeHtml,
  greetingName,
} from '../explorerWelcomeEmail';

/**
 * The welcome a landing-page signup receives.
 *
 * This email has one job: get somebody to finish a two-minute video. So the
 * assertions are about the two things that could quietly stop that happening -
 * copy that promises something untrue, and a link that does not land on the video
 * - rather than about markup.
 */

const LINK = 'https://enterprise.colaberry.ai/portal/verify?token=abc&next=%2Fportal%2Fruntime%2Fb0c844c0-01b0-439e-bc28-6a1b76b09afb';
const render = (fullName = 'Jordan Reyes') => buildExplorerWelcomeHtml({ fullName, portalLink: LINK });
/** Visible words only, so an assertion cannot be satisfied by an attribute. */
const visible = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('the advertising rule', () => {
  it('never uses the word barred by 40 TAC 807.172(d), anywhere', () => {
    // Checked over the WHOLE document, not just the visible text: a preheader and
    // a title attribute are both read by a human, and the first are the words an
    // inbox previews next to the subject line.
    const html = render();
    expect(html).not.toMatch(/\bfree\b/i);
    expect(EXPLORER_WELCOME_SUBJECT).not.toMatch(/\bfree\b/i);
  });

  it('uses the approved phrasings instead', () => {
    const text = visible(render());
    expect(text).toContain('$0 to start');
    expect(text).toMatch(/no card needed/i);
  });
});

describe('nothing is promised that cannot be pointed at', () => {
  it('names the first assignments that actually exist, with their real durations', () => {
    // These titles and minutes are the live week-0 `timeline_cards` rows. A
    // promise of work a new Explorer will not find is worse than no promise.
    const text = visible(render());
    for (const a of FIRST_ASSIGNMENTS) {
      expect(text).toContain(a.title);
      expect(text).toContain(`${a.minutes} min`);
    }
  });

  it('quotes no salary, placement rate or job count', () => {
    // The video cites figures; this email points AT them rather than restating
    // numbers it cannot verify. `$0` is the price and is allowed.
    const text = visible(render()).replace(/\$0/g, '');
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/\b\d{2,3}\s?%/);
    expect(text).not.toMatch(/\b\d{2,3}k\b/i);
  });

  it('carries the lines the video itself says, which is where the persuasion comes from', () => {
    // Each of these is an answer in week0ProgramVideoFirst.ts, checked against the
    // video's transcript on 2026-11-09. If the video is replaced, those answers
    // change and this test is the reminder that the email quotes it.
    const text = visible(render());
    expect(text).toContain('Finishing this video is your first win');
    expect(text).toMatch(/frontier engineer/i);
    expect(text).toMatch(/build real AI systems that work/i);
    expect(text).toMatch(/Every week Ali goes live/i);
    expect(text).toMatch(/don.{0,8}t need to be technical/i);
    expect(text).toMatch(/AI avatar/i);
  });

  it('names Ali and what he is', () => {
    expect(visible(render())).toMatch(/Ali Muwwakkil.{0,40}Managing Director/);
  });
});

describe('the link', () => {
  it('is the magic link, on the button and in the fallback', () => {
    // Three: the button's href, the fallback's href, and the fallback's visible
    // text. Counted rather than "at least one", so a template that quietly lost
    // the paste-it-yourself fallback would fail here - that fallback is the only
    // route in for a client that strips the button.
    const html = render();
    expect((html.match(/portal\/verify\?token=/g) || []).length).toBe(3);
  });

  it('keeps the destination that lands on the video', () => {
    // The `next` is what makes this one click instead of two. OH-4 added it and
    // nothing in this template may drop it.
    expect(render()).toContain('next=%2Fportal%2Fruntime%2F');
  });

  it('escapes the ampersand in the href, because an attribute is not a URL bar', () => {
    // A bare `&` inside an attribute is ambiguous markup. `&amp;` is the same URL
    // to any client that follows the spec, and the difference only shows up as a
    // sign-in link that works in most clients and silently not in one.
    const html = render();
    expect(html).toContain(`href="${LINK.replace(/&/g, '&amp;')}"`);
    expect(html).not.toContain(`href="${LINK}"`);
  });
});

describe('the greeting', () => {
  it('uses the first name only', () => {
    expect(visible(render('Jordan Reyes'))).toMatch(/You.{0,8}re in, Jordan\./);
  });

  it.each([
    ['an empty name', ''],
    ['whitespace', '   '],
    ['a name that is not one', '<script>'],
    ['a number', '12345'],
  ])('%s drops the name rather than greeting a stranger as "there"', (_label, name) => {
    const text = visible(render(name));
    expect(text).toMatch(/You.{0,8}re in\./);
    expect(text).not.toMatch(/there\./);
  });

  it('escapes a name that contains markup', () => {
    // greetingName already refuses this one, so the assertion is that BOTH guards
    // hold: nothing resembling a tag survives into the document.
    const html = buildExplorerWelcomeHtml({ fullName: '<img src=x onerror=alert(1)>', portalLink: LINK });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('onerror=');
  });

  it.each([
    ['a hyphenated name', 'Mary-Jane Watson', 'Mary-Jane'],
    ['an apostrophe', "O'Brien Smith", 'O&#39;Brien'],
    ['a non-ASCII name', 'José Álvarez', 'José'],
  ])('%s survives', (_label, full, expected) => {
    expect(render(full)).toContain(expected);
  });
});

describe('greetingName on its own', () => {
  it('takes the first word', () => {
    expect(greetingName('Jordan Reyes')).toBe('Jordan');
    expect(greetingName('  Jordan  ')).toBe('Jordan');
  });

  it('returns empty rather than a guess', () => {
    expect(greetingName('')).toBe('');
    expect(greetingName(null)).toBe('');
    expect(greetingName(undefined)).toBe('');
    expect(greetingName('<script>')).toBe('');
    expect(greetingName('12345')).toBe('');
  });
});

describe('the document itself', () => {
  it('leaves no unrendered template token', () => {
    expect(render()).not.toMatch(/\{\{|\$\{/);
  });

  it('has a preheader, which is the line an inbox shows beside the subject', () => {
    expect(render()).toMatch(/Two minutes with Ali/);
  });

  it('tells them the account is created by signing up, not by paying', () => {
    expect(visible(render())).toMatch(/Nothing to install, nothing to pay/);
  });
});
