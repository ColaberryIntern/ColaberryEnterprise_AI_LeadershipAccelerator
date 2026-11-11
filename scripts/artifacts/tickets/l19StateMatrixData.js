/**
 * l19StateMatrixData — DOC 19, what every surface shows in every state.
 *
 * P1-07 asks for exactly this and had no ticket: "Map every user/producer action and
 * empty/error/locked/reconnecting state to backend behavior. No disconnected feature screens."
 * DOC 18 recorded the sharper version of the gap - no test asserted what a viewer actually sees.
 *
 * ## Why each row names the test that proves it
 *
 * A state matrix is the easiest document in this repository to write as fiction. Every cell is a
 * sentence about behavior, nothing forces the behavior to match, and the document stays
 * plausible for months after the code moves. So `provenIn` is a required field: a row that
 * cannot name a test asserting it is a row describing an intention.
 *
 * The self-check does not merely require the field to be non-empty. It reads the named test file
 * and requires the named test to exist in it, so deleting a test leaves the document unbuildable
 * rather than quietly wrong.
 *
 * ## The one row that is a security property
 *
 * Backstage. It is the staff rehearsal state, and a viewer who could tell it from `scheduled`
 * would know when staff were in the room. The matrix states it and two separate tests hold it:
 * the backend sweep proving both resolve to the same moment, and a surface test proving the
 * waiting copy carries no staff vocabulary. The first version of that second test compared
 * `not_started` to itself and proved nothing; a mutation found it. That is recorded here because
 * a matrix row backed by a vacuous test is worse than one backed by none - it reads as covered.
 */

const META = {
  doc: 19,
  ticket: 'P1-07',
  title: 'Colaberry Live - state matrix',
  built: '2026-11-11',
  file: 'docs/colaberry-live/DOC_19_STATE_MATRIX.md',
  machine: 'backend/src/services/broadcast/broadcastStateMachine.ts',
  resolver: 'backend/src/services/broadcast/broadcastSessionLinks.ts',
};

/** Where a claim about the viewer surface is proved. Paths are repo-relative. */
const TESTS = {
  resolver: 'backend/src/services/broadcast/__tests__/broadcastSessionLinks.test.ts',
  viewer: 'frontend/src/pages/portal/__tests__/LiveSessionPage.test.tsx',
};

/**
 * The eight editorial states, each with the moment it resolves to and what each surface shows.
 *
 * `moment` is not decoration: it is the whole of what the viewer surface receives. Two states
 * that share a moment are indistinguishable downstream, which is the mechanism behind the
 * backstage rule rather than a convention anyone has to remember.
 */
const STATES = [
  {
    state: 'scheduled',
    moment: 'not_started',
    presenter: 'Off air. The deck can be presented; nothing is transmitted.',
    phone: 'Not started yet, with the reassurance that the page updates itself and the link stays the same.',
    producer: 'The strip offers Go backstage. Go live is blocked until the feed is ready and content is marked.',
    viewer: 'Not started yet. Same words as backstage, by construction.',
    provenIn: { file: TESTS.viewer, test: 'SCHEDULED: says it has not started and that the page updates itself' },
  },
  {
    state: 'backstage',
    moment: 'not_started',
    presenter: 'Backstage. Staff can see the program picture.',
    phone: 'Identical to scheduled. The room is never told staff are rehearsing.',
    producer: 'Full picture inside a staff-only frame. Mark content started becomes available.',
    viewer: 'Identical to scheduled. This is a security property, not a copy choice.',
    security: true,
    provenIn: { file: TESTS.viewer, test: 'leaks no staff vocabulary while a viewer is waiting' },
  },
  {
    state: 'live',
    moment: 'live',
    presenter: 'On air.',
    phone: 'The class is on this page: the player, the current question, and the status buttons.',
    producer: 'End and Cancel available. Audience and feed health read live.',
    viewer: 'Watching, with everything for the class on the one page.',
    provenIn: { file: TESTS.viewer, test: '%s: resolves to live, and the class is on this page' },
  },
  {
    state: 'reconnecting',
    moment: 'live',
    presenter: 'On air. The slides never block on a feed problem.',
    phone: 'Unchanged. A thirty-second blip must not tell the room the class ended.',
    producer: 'Health degrades and the auto-end window starts counting. Ending stays a producer decision.',
    viewer: 'Still live. Discovery and the resolver agree on this, deliberately.',
    provenIn: { file: TESTS.resolver, test: 'treats reconnecting as live, matching what discovery treats as on air' },
  },
  {
    state: 'ended',
    moment: 'ended',
    presenter: 'Off air.',
    phone: 'The class has ended.',
    producer: 'Terminal for the producer. The end reason says whether a human or the safety net did it.',
    viewer: 'Ended, with a replay promised only conditionally.',
    provenIn: { file: TESTS.viewer, test: '%s: says the class ended and does not promise a replay that may not exist' },
  },
  {
    state: 'processing',
    moment: 'ended',
    presenter: 'Off air.',
    phone: 'The class has ended.',
    producer: 'Not driven by the producer: begin_processing and publish_replay are not client-sendable.',
    viewer: 'Ended. The replay is conditional because processing can fail BACK to ended.',
    note: 'The state the prototype matrix was missing. `processing: [replay_ready, ended]` means '
      + 'processing can fail BACK to ended, so "aired, no replay" is a real outcome and no '
      + 'surface may promise a replay unconditionally.',
    provenIn: { file: TESTS.resolver, test: 'says ended once it is over, and offers nothing to watch' },
  },
  {
    state: 'replay_ready',
    moment: 'ended',
    presenter: 'Off air.',
    phone: 'The class has ended; the replay is in the portal.',
    producer: 'Terminal. Nothing further to command.',
    viewer: 'Ended, and the replay now exists.',
    provenIn: { file: TESTS.resolver, test: 'says ended once it is over, and offers nothing to watch' },
  },
  {
    // The state name is the DATABASE's spelling, not ours, so the two identifier lines below
    // carry the marker rather than being "corrected" into a value the machine does not hold.
    // Everything a person reads says "canceled", which is the American form the repo requires.
    state: 'cancelled', // spelling-exempt: the editorial_state value, not prose
    moment: 'cancelled', // spelling-exempt: the resolved moment name, not prose
    presenter: 'Off air. An in-room class can still be taught; nothing is broadcast.',
    phone: 'This class was canceled. Neither a start nor a replay is promised.',
    producer: 'Terminal and unreachable. No second occurrence can be minted for the session.',
    viewer: 'Canceled, stated plainly.',
    note: 'THE BUG THIS MATRIX FOUND. It resolved to `not_started`, so the page told everyone who '
      + 'scanned the code to leave it open and wait for a class that was called off.',
    provenIn: { file: TESTS.viewer, test: 'CANCELED: says so, and promises neither a start nor a replay' },
  },
];

/**
 * Conditions that are not editorial states but still need a treatment on every surface.
 *
 * Kept separate from STATES because conflating the two is how the prototype's table ended up
 * describing twelve "states" when the machine has eight: half its rows were scenarios.
 */
const CONDITIONS = [
  {
    condition: 'Measurement unavailable',
    rule: 'A count that cannot be read says so and gives its last reading. It never shows 0.',
    detail: 'The producer strip already does this: `N watching`, `N watching, not updating`, '
      + '`not measuring`, `no answer`, or nothing at all. Note the distinction a new surface must '
      + 'keep: a genuine zero DOES render as `0 watching`. The rule is about unmeasurable, not '
      + 'about zero.',
  },
  {
    condition: 'Command blocked',
    rule: 'The producer is told what to do next, never the server reason code.',
    detail: 'Seven reason shapes, two of them dynamic. An untranslated reason says the system '
      + 'gave no explainable reason and points at the log, rather than printing the identifier.',
  },
  {
    condition: 'Cannot reach the broadcast',
    rule: 'The last answer that arrived stays on screen, labeled as such.',
    detail: 'A producer mid-show needs the stale number more than they need an empty panel.',
  },
  {
    condition: 'Unknown / resolver failed',
    rule: 'Blame the check, not the link.',
    detail: 'A viewer who meets an error page concludes the link is broken and does not come '
      + 'back. The copy says the check cannot answer right now and that it is usually temporary.',
  },
];

const TOTALS = (() => ({
  states: STATES.length,
  conditions: CONDITIONS.length,
  surfaces: 4,
  cells: STATES.length * 4,
  moments: [...new Set(STATES.map((s) => s.moment))].sort(),
  securityRows: STATES.filter((s) => s.security).length,
}))();

module.exports = { META, TESTS, STATES, CONDITIONS, TOTALS };
