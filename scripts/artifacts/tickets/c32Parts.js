/**
 * C3.2's seven deliverables, each as its OWN standalone document.
 *
 * ## Why this exists
 *
 * The first attempt shipped all seven inside one HTML file and linked it from the ticket. Ali's
 * correction, 16 October 2026: "When you have this scenario where they want you to create a
 * bundle of things, those each need to be uploaded as a pdf. One for each item in the bundle."
 * And, looking at the comment: "i don't see these highlighted things."
 *
 * He was right, and the failure was worse than a formatting choice. Basecamp does not preview
 * HTML, so a comment that listed seven deliverables and linked one HTML file showed the reader
 * zero of them. The bundle existed and was invisible, which from the reader's side is the same
 * as not existing.
 *
 * Every part reads the same c32Data as the combined bundle, so a figure cannot differ between
 * the standalone PDF and the bundle it came from.
 */
const D = require('./c32Data');
const B = require('./c32Bundle');
const { esc } = require('../artifactTheme');
const { htmlDoc } = require('../renderArtifactPdf');

const S = B.sections;

/** A standalone part: same house style, its own cover line, and its own place in the set. */
function wrap(n, total, title, strap, inner, extraCss) {
  const body = `<div class="wrap">
  <div class="meta">C3.2 Anthropic meeting package &middot; item ${n} of ${total}
    &middot; figures re-read from production ${esc(D.AS_OF)}</div>
  <h1>${esc(title)}</h1>
  <div class="rule"></div>
  ${strap ? `<p>${esc(strap)}</p>` : ''}
  ${inner}
  <div class="meta" style="margin-top:22px;border-top:1px solid var(--border);padding-top:7px">
    Every figure traces to a row of the C0.6 claim registry and carries the date it was read.
    A build assertion refuses any claim that is not an approved, deck-eligible row, and refuses
    competing-lab content beyond CLM-025's required wording. Item ${n} of ${total} in the
    package.</div>
  </div>`;
  return htmlDoc({ title: 'C3.2 ' + title, css: B.CSS + (extraCss || ''), body });
}

/** Slides get one page each, so the deck reads as a deck rather than as a list. */
const DECK_CSS = `
  .slide { break-inside: avoid; page-break-inside: avoid; min-height: 196mm;
           display: flex; flex-direction: column; justify-content: center;
           break-after: page; page-break-after: always; }
  .slide:last-of-type { break-after: auto; page-break-after: auto; }
  .slide h3 { font-size: 21pt; display: block; margin: 4px 0 10px; }
  .slide .kick { font-size: 10pt; }
  .slide .num { width: 30px; height: 30px; line-height: 30px; font-size: 13pt; }
  .slide ul { margin: 10px 0 8px 24px; }
  .slide li { margin: 9px 0; font-size: 13pt; line-height: 1.5; }
  .cites { font-size: 9pt; margin-top: 14px; }
`;

function parts() {
  const cited = D.assertRegistryGated();
  const ask = D.assertOneAsk();
  const total = 7;
  return [
    { n: 1, slug: 'C32_1_LEAVE_BEHIND', file: 'C32_1_LEAVE_BEHIND.pdf', maxPages: 1,
      title: 'One-page leave-behind',
      what: 'the one-pager, which must survive being forwarded without us',
      html: wrap(1, total, 'One-page leave-behind',
        'Written to survive being forwarded without us, so it repeats the disclaimers rather '
        + 'than relying on anything said in the room.', S.leaveBehind()) },

    { n: 2, slug: 'C32_2_PARTNER_DECK', file: 'C32_2_PARTNER_DECK.pdf', maxPages: 0,
      title: 'Partner deck',
      what: 'the deck, nine slides, one per page, ending on one ask',
      html: wrap(2, total, 'Partner deck, nine slides',
        'Ends on exactly one ask, asserted at build time: ' + ask.title + '. One slide per page.',
        S.deck(), DECK_CSS) },

    { n: 3, slug: 'C32_3_CAPABILITY_STATEMENT', file: 'C32_3_CAPABILITY_STATEMENT.pdf',
      maxPages: 0, title: 'Capability statement',
      what: 'what is live, what is in pilot, what is roadmap',
      html: wrap(3, total, 'Capability statement', '', S.capability()) },

    { n: 4, slug: 'C32_4_DEMO_OUTLINE', file: 'C32_4_DEMO_OUTLINE.pdf', maxPages: 1,
      title: 'Three-minute demo outline',
      what: 'the demo, beat by beat, ending on the ask',
      html: wrap(4, total, 'Three-minute demo outline', '', S.demo()) },

    { n: 5, slug: 'C32_5_MEETING_AGENDA', file: 'C32_5_MEETING_AGENDA.pdf', maxPages: 1,
      title: 'Meeting agenda',
      what: 'thirty minutes, with the ask in the last five',
      html: wrap(5, total, 'Meeting agenda, thirty minutes', '', S.agenda()) },

    { n: 6, slug: 'C32_6_FAQ', file: 'C32_6_FAQ.pdf', maxPages: 0,
      title: 'FAQ',
      what: 'the seven questions a lab audience raises, plus the three reserved to Ali',
      html: wrap(6, total, 'FAQ',
        'Selected from C2.6. Not all sixteen: these are the questions an AI lab asks, which is a '
        + 'different set from the ones a customer asks. Each carries the line NOT to say.',
        S.faq()) },

    { n: 7, slug: 'C32_7_EVIDENCE_APPENDIX', file: 'C32_7_EVIDENCE_APPENDIX.pdf', maxPages: 0,
      title: 'Evidence appendix',
      what: 'every number, its registry row, and the date it was read',
      html: wrap(7, total, 'Evidence appendix', '', S.evidence(cited)) },
  ];
}

module.exports = { parts };
