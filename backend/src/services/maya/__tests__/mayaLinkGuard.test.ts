/**
 * Maya's link guard: she may only send links the portal can render.
 *
 * The case these are written from is real. On 2026-11-08 a learner asked "you provide tours?"
 * and Maya answered "Let me get that started for you. Here's the link to begin the tour:
 * [Start Campus Tour](/portal/campus/map)" without calling `start_campus_tour`. That path does
 * not exist, the renderer refused it, and the learner was shown raw markdown.
 *
 * So the property under test is not "does it format links nicely". It is: AFTER THIS FUNCTION,
 * NO MARKDOWN LINK REMAINS THAT THE RENDERER WOULD REFUSE. That is asserted over every case,
 * rather than case by case, because the failure mode is a link nobody thought to enumerate.
 */
import { BOOK_CALL_LINK, BOOK_CALL_PATH, TOUR_LINK, TOUR_PATH } from '../mayaPortalTools';
import { guardLinks } from '../mayaLinkGuard';

/** The renderer's rule, restated as an assertion: only these two paths may survive as links. */
const linkTargets = (s: string): string[] =>
  [...s.matchAll(/\[([^\]\n]{1,80})\]\(([^)\s]{1,300})\)/g)].map((m) => m[2]);

const expectInvariant = (out: string): void => {
  for (const target of linkTargets(out)) {
    expect([TOUR_PATH, BOOK_CALL_PATH]).toContain(target);
  }
};

describe('the production case, 2026-11-08', () => {
  const broken =
    "Yes, I can help you start a guided tour of our campus! Here's the link to begin the tour: " +
    '[Start Campus Tour](/portal/campus/map). Enjoy exploring!';

  it('turns the invented link into the real one', () => {
    const r = guardLinks(broken);
    expect(r.repairedTour).toBe(true);
    expect(r.removed).toEqual(['/portal/campus/map']);
    expect(r.reply).toContain(TOUR_LINK);
    expect(r.reply).not.toContain('/portal/campus/map');
    expectInvariant(r.reply);
  });

  it('keeps the sentence around it, so the reply still reads as a sentence', () => {
    const r = guardLinks(broken);
    expect(r.reply).toContain('Yes, I can help you start a guided tour');
    expect(r.reply).toContain('Enjoy exploring!');
  });
});

describe('real links are left exactly alone', () => {
  it('keeps the tour link untouched', () => {
    const s = `Here is what the tour shows. ${TOUR_LINK}`;
    const r = guardLinks(s);
    expect(r.reply).toBe(s);
    expect(r.removed).toEqual([]);
    expect(r.repairedTour).toBe(false);
  });

  it('keeps the booking link untouched', () => {
    const s = `Pick a time that suits you. ${BOOK_CALL_LINK}`;
    expect(guardLinks(s).reply).toBe(s);
  });

  it('leaves a reply with no links at all exactly as it was', () => {
    const s = 'We run an open house on the 19th. Would you like me to book you a call?';
    expect(guardLinks(s).reply).toBe(s);
  });
});

describe('fabricated links', () => {
  it('repairs an invented booking path into the real booking link', () => {
    const r = guardLinks('Sure: [Book a call](/portal/admissions/book-now)');
    expect(r.repairedBooking).toBe(true);
    expect(r.reply).toContain(BOOK_CALL_LINK);
    expectInvariant(r.reply);
  });

  it('strips an unrepairable internal link to its label', () => {
    const r = guardLinks('See [your transcript](/portal/records/transcript) for details.');
    expect(r.reply).toBe('See your transcript for details.');
    expect(r.removed).toEqual(['/portal/records/transcript']);
    expectInvariant(r.reply);
  });

  it('never substitutes for an external URL, it only strips it', () => {
    // We have no standing to decide what somebody else's link meant. Substituting a destination
    // would be inventing one in exactly the way this guard exists to stop.
    const r = guardLinks('Read [the syllabus](https://example.com/tour) first.');
    expect(r.reply).toBe('Read the syllabus first.');
    expect(r.repairedTour).toBe(false);
    expectInvariant(r.reply);
  });

  it('does not add a second tour link when the real one is already present', () => {
    const r = guardLinks(`[Start the tour](/portal/campus/map) or use ${TOUR_LINK}`);
    expect(r.reply.split(TOUR_PATH).length - 1).toBe(1);
    expect(r.repairedTour).toBe(false);
    expectInvariant(r.reply);
  });

  it('repairs at most one tour link when two are invented', () => {
    const r = guardLinks('[tour A](/portal/campus/map) and [tour B](/portal/campus/walk)');
    expect(r.reply.split(TOUR_PATH).length - 1).toBe(1);
    expect(r.removed).toEqual(['/portal/campus/map', '/portal/campus/walk']);
    expectInvariant(r.reply);
  });

  it('handles a tour and a booking link in the same reply', () => {
    const r = guardLinks('[tour](/portal/campus/map) and [call us](/portal/book)');
    expect(r.reply).toContain(TOUR_PATH);
    expect(r.reply).toContain(BOOK_CALL_PATH);
    expectInvariant(r.reply);
  });
});

describe('the invariant holds over every shape tried', () => {
  const samples = [
    'plain text, no link at all',
    '[a](/portal/campus/map)',
    '[b](/x) [c](/y) [d](/z)',
    `[e](/tour) ${TOUR_LINK} [f](https://example.com)`,
    '[g](mailto:someone@example.com)',
    `${BOOK_CALL_LINK} ${TOUR_LINK}`,
  ];

  it.each(samples)('leaves no unrenderable link in: %s', (s: string) => {
    expectInvariant(guardLinks(s).reply);
  });

  it('the control: the samples really do contain links, so the check is not vacuous', () => {
    // Without this, a guard that deleted everything, or a matcher that matched nothing, would
    // satisfy every assertion above.
    expect(linkTargets(samples[1]).length).toBe(1);
    expect(linkTargets(samples[2]).length).toBe(3);
  });

  it('does not leave a script-scheme URL in the text', () => {
    expect(guardLinks('[click](javascript:alert(1))').reply).not.toContain('javascript:');
  });
});
