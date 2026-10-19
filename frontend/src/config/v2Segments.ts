/**
 * v2Segments - the content for the five buyer-segment pages from the C5.1 information
 * architecture.
 *
 * WHY CONFIG RATHER THAN FIVE PAGE COMPONENTS. C5.1 settled that the four segment pages
 * share one template so they cannot drift into four different arguments: the category noun
 * moves by segment per C2.1, the promise underneath does not. Keeping the words in a config
 * and the layout in one component is what makes that structural instead of a convention.
 *
 * WHICH ARE READY. Ali decided on 18 October 2026 that higher education is built first,
 * because C2.5 approved it as the beachhead: the continuing education unit is self-funded
 * and its dean signs without a faculty senate. Enterprise (C5.5) and workforce (C5.6)
 * followed the same day, and the ecosystem partners page (C5.8) on 19 October. Only
 * government still carries `ready: false` and is not routed, so a half-written page cannot
 * reach a visitor by accident. Ali decided on 18 October that government gets its own
 * section rather than folding into workforce; that page still needs a ticket raised in
 * group 05, and it is now the last unwritten door in the C5.1 information architecture.
 *
 * WHY THE SEGMENTS MUST NOT READ ALIKE. Sharing a template is what stops five different
 * arguments; it is not permission to ship the same page five times. Each segment moves the
 * category noun per C2.1 and frames the proof band as THAT buyer would check it: a dean is
 * asked to evidence outcomes, a sponsor is asked what changed, a workforce board answers
 * to a funder, and a partner is judged on what the client can do once they have left. A
 * test asserts the ledes and proof bands are distinct, for that reason.
 *
 * THE ECOSYSTEM PAGE CARRIES A SPECIFIC RISK. It is a page about partnering, and
 * `anthropic.partner` is DO_NOT_PUBLISH in the C0.6 registry: no contract, badge or
 * authorization was ever located for it. So the page never claims a partnership with a
 * lab. It uses `anthropic.capability`, whose approved wording is the plain statement of
 * what we build with, and a test asserts no segment claims an Anthropic partnership.
 *
 * NO PRICES HERE, DELIBERATELY. ServicesV2 set the precedent on 7 August 2026 and asserts
 * it with a test: a named tier with the price behind a conversation beats a number a
 * prospect can anchor on. There is a second reason on this page. C2.3 approved a self-paced
 * license at $150 a learner and an entry block of 60 learners at $9,000, which sits inside
 * the $10,000 a public buyer can spend with no competition and no board vote. That is a
 * genuinely strong fact for this buyer and it has no row in the C0.6 claim registry, and
 * the registry is the gate for anything externally visible. It should get a row; until it
 * does it does not ship.
 */

export interface SegmentSection {
  /** Short heading. */
  h: string;
  /** One or two sentences. No figures unless they come through <Claim>. */
  body: string;
}

export interface Segment {
  /** Route slug, verified free against the real route tree in C5.1. */
  slug: string;
  /** Marketing name, and the door label on the homepage. */
  name: string;
  /** Whether this page is routed yet. Only higher education is, today. */
  ready: boolean;
  /** The category noun for this segment, per C2.1. The promise under it does not move. */
  noun: string;
  /** Page title and meta description. */
  seoTitle: string;
  seoDescription: string;
  /** Band 1: the promise, in this segment's noun. */
  lede: string;
  /** Band 2: what this buyer gets. Three, not five. */
  gets: SegmentSection[];
  /** Band 3: why the proof matters to THIS buyer specifically. */
  proof: string;
  /** Band 4: the single call to action. */
  ctaLabel: string;
}

export const SEGMENTS: Segment[] = [
  {
    slug: 'higher-education',
    name: 'Higher education',
    ready: true,
    noun: 'AI readiness',
    seoTitle: 'AI readiness for continuing education',
    seoDescription:
      'Your learners build real AI systems, and you get proof of what each person built, '
      + 'verified against the code they wrote. Built for continuing education units that '
      + 'need evidence, not attendance.',
    lede:
      'Your learners build working AI systems against real problems, and you get proof of '
      + 'what each person actually built, verified against the code they wrote.',
    gets: [
      {
        h: 'Evidence an employer will accept',
        body:
          'Every completed piece of work links to the commit behind it, in the learner’s '
          + 'own repository. An employer can open it without an account and without taking '
          + 'your word for it.',
      },
      {
        h: 'A record per learner, not a completion rate',
        body:
          'You can show what one named person built, which is the question a dean is asked '
          + 'and the one a cohort-level number cannot answer.',
      },
      {
        h: 'It runs beside your catalog, not through your faculty senate',
        body:
          'Designed for a continuing education unit that controls its own schedule and its '
          + 'own budget, so the decision sits with the people who have to live with it.',
      },
    ],
    proof:
      'Higher education is asked to evidence outcomes more often than any other buyer we '
      + 'meet, and attendance data does not answer the question. This is the part worth '
      + 'checking rather than believing: open a learner page and click through to the '
      + 'commit.',
    ctaLabel: 'Talk to us about a cohort',
  },

  {
    slug: 'enterprise',
    name: 'Enterprise',
    ready: true,
    noun: 'AI enablement',
    seoTitle: 'AI enablement for enterprise teams',
    seoDescription:
      'Your own people build working AI systems against your own business problems, and '
      + 'you get proof of what each one built, verified against the code they wrote.',
    lede:
      'Your own people build working AI systems against your own business problems, and '
      + 'you keep both the software and the people who built it.',
    gets: [
      {
        h: 'Your problems, not a training catalog',
        body:
          'Participants build against business problems you name, owned by people on your '
          + 'side who can answer questions while the build is happening. The output is '
          + 'software aimed at your work, not an exercise.',
      },
      {
        h: 'Capability that stays after we leave',
        body:
          'You are not renting a vendor team. The people who built it still work for you '
          + 'when the engagement ends, which is the difference between buying a system and '
          + 'being able to build the next one.',
      },
      {
        h: 'A record per person, not a completion rate',
        body:
          'You can show what one named participant built, linked to the commit behind it. '
          + 'That is the question a sponsor is asked, and a cohort-level number cannot '
          + 'answer it.',
      },
    ],
    proof:
      'An executive sponsor is eventually asked what changed, and a training report does '
      + 'not answer that. This is the part worth checking rather than believing: open a '
      + 'published record and follow it to the commit.',
    ctaLabel: 'Talk to us about your team',
  },
  {
    slug: 'workforce',
    name: 'Workforce and economic development',
    ready: true,
    noun: 'workforce readiness',
    seoTitle: 'Workforce readiness you can evidence',
    seoDescription:
      'Participants finish with working software they built themselves, and every piece of '
      + 'it links to the commit behind it, so completion is something a funder can open '
      + 'rather than something you assert.',
    lede:
      'Participants finish with working software they built themselves, and every piece of '
      + 'it can be opened and checked by the people you report to.',
    gets: [
      {
        h: 'Outcomes a funder can open',
        body:
          'Every completed piece of work links to the commit behind it, in the '
          + 'participant’s own repository. Someone reviewing your program can look at it '
          + 'directly, without an account and without taking your word for it.',
      },
      {
        h: 'Built for the reporting you already owe',
        body:
          'Your obligation is to evidence who completed and what they can now do. A record '
          + 'per named participant answers both questions in the form they are asked, '
          + 'rather than leaving you to assemble it afterwards.',
      },
      {
        h: 'Participants leave with work, not a certificate',
        body:
          'They finish holding software they built, in a repository that is theirs. That '
          + 'is what an employer asks to see, and it keeps working as evidence long after '
          + 'the program ends.',
      },
    ],
    proof:
      'A workforce board answers to a funder who wants to know what participants can '
      + 'actually do now. This is the part worth checking rather than believing: open a '
      + 'published record and follow it to the commit.',
    ctaLabel: 'Talk to us about a program',
  },

  // ── Not routed yet. C5.8, and the government page Ali approved on 18 October 2026,
  //    which still needs a ticket raised in group 05.
  {
    slug: 'government',
    name: 'Government',
    ready: false,
    noun: 'workforce readiness',
    seoTitle: '',
    seoDescription: '',
    lede: '',
    gets: [],
    proof: '',
    ctaLabel: '',
  },
  {
    slug: 'ecosystem',
    name: 'Strategic AI ecosystem partners',
    ready: true,
    noun: 'AI enablement',
    seoTitle: 'AI enablement your clients can verify',
    seoDescription:
      'Deliver capability building under your own relationship, and end the engagement '
      + 'with evidence your client can open and check rather than a satisfaction score.',
    lede:
      'You hold the client relationship. We build the capability underneath it, and your '
      + 'client ends up with proof they can check rather than a report they have to trust.',
    gets: [
      {
        h: 'Your account stays yours',
        body:
          'We deliver the capability build and nothing else. No parallel relationship with '
          + 'your client, no attempt to sell past you, and no competing scope. That is the '
          + 'first question every partner asks and it deserves the first answer.',
      },
      {
        h: 'An engagement that ends in evidence',
        body:
          'Every completed piece of work links to the commit behind it, in the '
          + 'participant’s own repository. You can show a sponsor what each named '
          + 'person built instead of attendance and a feedback form.',
      },
      {
        h: 'Built on the tooling your clients are already asking about',
        body:
          'We build on Claude and Claude Code. Your clients are raising it in meetings '
          + 'already, and the work your people deliver is done with it rather than about it.',
      },
    ],
    proof:
      'A partner is judged on what the client can do once you have left, which is a harder '
      + 'bar than whether the engagement went well. This is the part worth checking rather '
      + 'than believing: open a published record and follow it to the commit.',
    ctaLabel: 'Talk to us about partnering',
  },
];

/** The segments that are actually routed today. */
export const readySegments = (): Segment[] => SEGMENTS.filter((s) => s.ready);

export const getSegment = (slug: string): Segment | undefined =>
  SEGMENTS.find((s) => s.slug === slug && s.ready);
