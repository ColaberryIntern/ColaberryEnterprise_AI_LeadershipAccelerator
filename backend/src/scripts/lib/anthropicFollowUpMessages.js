// anthropicFollowUpMessages.js
//
// The content of the Claude Partner Network follow-up sequence: one short,
// self-contained note per weekday until Anthropic replies.
//
// EDITORIAL CONTRACT (these are not style preferences, they are the brief):
//   - Warm, brief, complimentary. Never pushy, never wounded, never entitled.
//   - Every note GIVES something (a compliment, a detail, a useful fact) before
//     it asks anything. A daily note that only asks is harassment with manners.
//   - No note ever counts the days, scolds, or implies fault on their side.
//   - Every factual claim traces to something we can prove. The submission date,
//     the four course names, and the completion counts are the only numbers used
//     anywhere in this sequence, and they come from the June 24 submission and
//     the Basecamp cohort records. Invent nothing.
//   - No em-dashes anywhere (mandrillPreflight hard-fails on them).
//   - "Ali Muwwakkil" appears exactly once per message, in the signature that
//     the renderer appends (mandrillPreflight fails a second occurrence).
//
// The sequence is FINITE by design. Fifteen weekday notes, then it stops itself
// and hands back to a human. An unbounded daily send is the kind of thing that
// turns a warm prospect cold, and it is the outreach equivalent of an infinite
// retry loop, which this repo forbids.
//
// Shape of each entry:
//   { angle, subject, paragraphs: [string], ask: string }
// The renderer joins paragraphs, appends the ask as the final paragraph, and
// adds the branded signature. See anthropicFollowUpRender.js.

const SEQUENCE = [
  {
    angle: 'reintroduction',
    subject: 'Colaberry and the Claude Partner Network (submitted 6/24)',
    paragraphs: [
      'We submitted our Claude Partner Network Learning Path completion on June 24 for ten people at Colaberry, and rather than only file a status request, we thought it was worth introducing ourselves properly.',
      'The Academy path was genuinely well built. Introduction to MCP in particular reset how our architects think about tool boundaries, and that thinking has already worked its way into how we teach enterprise teams.',
      'We are eager to join the Partner Network and happy to supply anything still outstanding on our side.',
    ],
    ask: 'If you can tell us where our application stands, we would be grateful.',
  },
  {
    angle: 'what-the-courses-changed',
    subject: 'Claude Partner Network: what the Academy path changed for our team',
    paragraphs: [
      'A small note of thanks while our Partner Network application is in your queue.',
      'Ten of our people completed Introduction to Agent Skills, Building with the Claude API, Introduction to MCP, and Claude Code in Action. The one that landed hardest was Claude Code in Action. Several of our senior engineers came out of it building differently than they went in, which is not something we can say about most vendor training.',
      'We would very much like to make the partnership official.',
    ],
    ask: 'Any signal on the status of our June 24 submission would help us plan.',
  },
  {
    angle: 'the-numbers',
    subject: 'Claude Partner Network: Colaberry completion detail, if useful',
    paragraphs: [
      'In case it is useful to whoever picks up our file, here is the detail behind our June 24 submission.',
      'The requirement was ten people through the four course path. We finished with eleven people completing all four, and forty four course completions against a target of forty. We put more into it than the bar asked for because we intend to build on Claude seriously, not to collect a badge.',
      'We remain very interested in joining the network.',
    ],
    ask: 'Please let us know if you need the roster or any completion records from our side.',
  },
  {
    angle: 'make-it-easy',
    subject: 'Claude Partner Network: happy to resubmit if something is missing',
    paragraphs: [
      'One thought on our pending Partner Network application. If the form we used on June 24 was missing a field, or if one of our completions did not match against the right account, we would rather fix it than wait on it.',
      'One of our eleven finishers originally enrolled under a personal address before moving to his colaberry.com account, so a mismatch on our end is entirely possible.',
      'We are glad to resubmit in whatever form is easiest for you.',
    ],
    ask: 'If anything is missing, tell us what and we will turn it around the same day.',
  },
  {
    angle: 'week-one-close',
    subject: 'Claude Partner Network: a good week to you',
    paragraphs: [
      'Closing out the week with a short note rather than a long one.',
      'We know a partner queue in a company growing at your pace is not a quiet place to work, and we are not trying to jump it. We would simply like to be in the network, and we would like you to know there is a team here that is ready when you are.',
      'Thank you for the care that clearly went into the Academy curriculum. It shows.',
    ],
    ask: 'Whenever our June 24 submission surfaces, we would welcome the update.',
  },
  {
    angle: 'mission-alignment',
    subject: 'Claude Partner Network: why this partnership matters to us',
    paragraphs: [
      'A note on why we keep raising our hand about the Partner Network.',
      'Our work is teaching enterprise teams to build AI systems responsibly, and our CEO wrote a book called Trust Before Intelligence on exactly that premise. Anthropic is the one lab whose public posture on safety matches what we already tell our clients. That alignment is the whole reason we put our people through your curriculum and not through one of the alternatives.',
      'We would be proud to carry the partner designation.',
    ],
    ask: 'We would appreciate any word on where our application sits.',
  },
  {
    angle: 'what-we-teach',
    subject: 'Claude Partner Network: what we are building on Claude',
    paragraphs: [
      'A little context on the team behind our June 24 submission.',
      'Colaberry runs an AI Systems Architect Accelerator for working professionals, and the material your Academy path covers is now foundational to how we teach it. Every architect we graduate learns MCP, agent skills, and Claude Code as core practice rather than as an elective.',
      'Partner status would let us do that with your blessing and your resources behind it, which is why we keep asking.',
    ],
    ask: 'A quick note on our application status would mean a lot to this team.',
  },
  {
    angle: 'right-door',
    subject: 'Claude Partner Network: are we knocking on the right door?',
    paragraphs: [
      'A genuine question rather than another status request.',
      'We have been writing to partner support because that is the address the submission receipt pointed us to. If Partner Network admissions are handled by a different team, or if there is a portal where we should be watching for a decision instead of an inbox, we are happy to go there and stop filling this queue.',
      'We would rather be easy to work with than persistent in the wrong place.',
    ],
    ask: 'If we should be talking to someone else, please point us and we will go.',
  },
  {
    angle: 'certification-interest',
    subject: 'Claude Partner Network: our team is ready for certification',
    paragraphs: [
      'One forward looking note while our application is pending.',
      'Our understanding is that Partner Network admission opens the door to the architect certification. We polled the eleven people who finished the Academy path and the interest is unanimous. They are ready to enroll the day we are admitted.',
      'It is a rare thing to have a group this motivated waiting on a door to open, and we would hate to lose that momentum.',
    ],
    ask: 'If admission is close, we would love to know so we can line them up.',
  },
  {
    angle: 'week-two-close',
    subject: 'Claude Partner Network: still glad to be in your queue',
    paragraphs: [
      'A brief end of week note.',
      'Nothing has changed on our side. Eleven people trained, a company that wants to build on Claude, and an application from June 24 waiting patiently. We are not going anywhere and we are not upset. We are just interested, and we would rather say so than go quiet.',
      'We hope the week treated your team well.',
    ],
    ask: 'Any update on our submission would be welcome whenever it is convenient.',
  },
  {
    angle: 'the-builders',
    subject: 'Claude Partner Network: the people behind the application',
    paragraphs: [
      'Something we should probably have led with.',
      'The eleven who completed your path are not a training cohort assembled to clear a bar. They are our practicing architects, instructors, and delivery leads, the people who will be in front of enterprise clients explaining what Claude can and cannot responsibly do. Whatever standard the Partner Network is holding, these are the people we would want held to it.',
      'We would like them carrying your partner designation.',
    ],
    ask: 'We would be grateful for any read on our application status.',
  },
  {
    angle: 'smallest-ask',
    subject: 'Claude Partner Network: a yes or no is plenty',
    paragraphs: [
      'Making this one as small as we can.',
      'We are not asking for a decision today. A single line telling us the June 24 submission was received and is in the queue would settle it entirely, and we would stop wondering whether it fell into a gap between systems.',
      'One sentence is genuinely enough.',
    ],
    ask: 'Received and pending, or resubmit? Either answer works for us.',
  },
  {
    angle: 'roster-ready',
    subject: 'Claude Partner Network: roster ready on request',
    paragraphs: [
      'A short practical note.',
      'If verifying the eleven completions is the slow part, we can hand you the roster with names, colaberry.com addresses, and completion dates in whatever format your team prefers, including a plain spreadsheet.',
      'We would rather do that work than have it sit on your side of the desk.',
    ],
    ask: 'Say the word and the roster is with you within the hour.',
  },
  {
    angle: 'long-game',
    subject: 'Claude Partner Network: we are in this for the long run',
    paragraphs: [
      'A note about patience rather than urgency.',
      'We are building a multi year practice around this technology. Our cohorts run through November and beyond, and every one of them touches Claude. Whether the partnership is confirmed this month or next quarter, we are still building the same thing.',
      'We would simply rather build it alongside you than adjacent to you.',
    ],
    ask: 'Whenever the June 24 submission is reviewed, we would love to hear.',
  },
  {
    angle: 'graceful-pause',
    subject: 'Claude Partner Network: our last daily note, and an open door',
    paragraphs: [
      'This is the last of our daily notes, and we want to end it well.',
      'We have written each weekday for three weeks because we are genuinely enthusiastic about joining the Claude Partner Network, not because we felt owed a reply. Enthusiasm past a certain point becomes noise, and we would rather stop short of that line than cross it.',
      'So we will step back. Our June 24 submission stands, our eleven trained people are still here, and our interest has not cooled at all. If a reply comes next week or next quarter, it will find a very willing partner on this end.',
      'Thank you for the Academy curriculum, and for the work your team is doing. It has been worth the wait either way.',
    ],
    ask: 'The door is open whenever you are ready. We will check back in a month.',
  },
];

// Sanity: the sequence is the contract. If someone adds a message without an
// angle or subject, fail at require time rather than at 8:30 in the morning.
SEQUENCE.forEach((m, i) => {
  if (!m.angle || !m.subject || !Array.isArray(m.paragraphs) || !m.paragraphs.length || !m.ask) {
    throw new Error(`anthropicFollowUpMessages: entry ${i + 1} is malformed`);
  }
});

module.exports = { SEQUENCE, SEQUENCE_LENGTH: SEQUENCE.length };
