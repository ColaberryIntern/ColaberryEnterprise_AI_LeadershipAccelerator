import {
  ConversationRow,
  buildConversations,
  suspectReasons,
} from '../conversations';

/**
 * R7 — conversations in progress, and the reason there are none.
 *
 * Ali, via the ticket: *"try to map in current events like meetings and in talks with. A deal
 * in conversation is the most current signal there is and today it is invisible to every
 * surface."* And the warning that shapes every test below: *"Expect this surface to be sparse
 * and do not let sparse render as healthy."*
 *
 * Measured 2026-11-27, the surface is thin but NOT dormant: the last booked meeting was
 * 2026-04-28 and the last answered call 2026-04-13, both far outside the 180-day window,
 * yet six replies land inside it, so `dormant` is false against production. Three of the
 * nine booked meetings are test rows.
 *
 * The dormant fixtures below are deliberately narrower than production: REAL_NINE holds
 * only the nine booked meetings, so nothing in it falls inside the window. That is what
 * makes it a test of the dormant path rather than a description of the live board.
 *
 * So these cover the ways this card could tell a comfortable lie:
 *
 *   - leading with "9 meetings booked" when none is inside the window
 *   - counting a test row as a commercial meeting
 *   - reporting a meeting as HELD, which nothing in the system records
 *   - calling an empty instrument a quiet quarter, or the reverse
 */
const NOW = new Date('2026-11-25T12:00:00.000Z');
const OPTS = {
  now: NOW,
  windowDays: 180,
  appointmentsRows: 0,
  strategyCalls: [
    { status: 'no_show', rows: 7, latest: '2026-04-28' },
    { status: 'cancelled', rows: 2, latest: '2026-04-01' },
    { status: 'completed', rows: 1, latest: '2026-03-23' },
  ],
};

const row = (over: Partial<ConversationRow> = {}): ConversationRow => ({
  id: 'io-1',
  outcome: 'booked_meeting',
  leadId: 1528,
  name: 'Ryan Landry',
  company: 'LandJet / Broadhill Capital',
  at: '2026-03-23T10:00:00.000Z',
  ...over,
});

/** The nine booked meetings as production really holds them, test rows included. */
const REAL_NINE: ConversationRow[] = [
  row({ id: 'a', name: 'Ali Muwwakkil (Test)', company: 'Colaberry Test Corp', at: '2026-04-28' }),
  row({ id: 'b', name: 'Anand A', company: 'MS', at: '2026-04-24' }),
  row({ id: 'c', name: 'Test User', company: 'Test', at: '2026-04-22' }),
  row({ id: 'd', name: 'Mike Nelson', company: null, at: '2026-04-01' }),
  row({ id: 'e', name: 'Bibiane Nsah', company: null, at: '2026-03-31' }),
  row({ id: 'f', name: 'Mike Nelson', company: null, at: '2026-03-30' }),
  row({ id: 'g', name: 'Jack Mitch', company: 'Routhcrip', at: '2026-03-26' }),
  row({ id: 'h', name: 'Test User', company: 'Test', at: '2026-03-26' }),
  row({ id: 'i', name: 'Ryan Landry', company: 'LandJet', at: '2026-03-23' }),
];

describe('dormancy leads, because sparse must not render as healthy', () => {
  it('says nothing has happened in the window, not how many ever did', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    expect(v.dormant).toBe(true);
    expect(v.headline).toContain('Nothing in 180 days');
    expect(v.headline).toContain('dormant');
    // The comfortable version of the same data.
    expect(v.headline).not.toContain('9 conversations');
  });

  it('names the date and the gap, so the reader can judge the age', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    expect(v.lastAt).toBe('2026-04-28');
    expect(v.daysSince).toBe(211);
    expect(v.headline).toContain('2026-04-28');
    expect(v.headline).toContain('211 days ago');
  });

  it('reports activity plainly when there IS some', () => {
    // The control: dormancy is a consequence of the data, not a permanent message.
    const v = buildConversations(
      [row({ at: '2026-11-20' }), ...REAL_NINE],
      OPTS,
    );
    expect(v.dormant).toBe(false);
    expect(v.headline).toContain('1 conversation inside the last 180 days');
    expect(v.headline).not.toContain('dormant');
  });

  it('distinguishes an empty instrument from a quiet quarter', () => {
    const v = buildConversations([], OPTS);
    expect(v.headline).toContain('has ever been recorded');
    expect(v.headline).toContain('empty instrument, not a quiet quarter');
    expect(v.lastAt).toBeNull();
    expect(v.daysSince).toBeNull();
  });
});

describe('a test row is flagged, not counted and not dropped', () => {
  it('flags a lead named as a test', () => {
    expect(suspectReasons(row({ name: 'Test User' })))
      .toContain('the lead is named as a test');
  });

  it('flags a company named as a test', () => {
    expect(suspectReasons(row({ name: 'Ali Muwwakkil (Test)', company: 'Colaberry Test Corp' })))
      .toContain('the company is named as a test');
  });

  it('flags a row with no name at all', () => {
    expect(suspectReasons(row({ name: null }))).toContain('no name is recorded against the lead');
  });

  it('says nothing about a real row', () => {
    // The control: a flag is a consequence of the row, not decoration on every row.
    expect(suspectReasons(row({ name: 'Bibiane Nsah', company: null }))).toEqual([]);
  });

  it('counts how many of the nine are suspect, and still lists all nine', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    const booked = v.tiers.find((t) => t.key === 'meeting_booked');
    // Dropping them would hide that the cleanup is outstanding.
    expect(booked?.entries).toHaveLength(9);
    expect(booked?.suspectCount).toBe(3);
  });

  it('does not let "contest" or "latest" trip the test-row check', () => {
    // A substring match on "test" would flag a real person. The check is word-bounded.
    expect(suspectReasons(row({ name: 'Ernest Contreras', company: 'Latest Ventures' })))
      .toEqual([]);
  });

  /**
   * Testa is a real surname, and "Testa" is where a substring match on the NAME survives a
   * fixture built from "Ernest": neither "Ernest" nor "Contreras" contains the four letters.
   * A mutation check found that gap, so the case is a real person rather than a word game.
   */
  it('does not flag a lead whose surname merely begins with those letters', () => {
    expect(suspectReasons(row({ name: 'Maria Testa', company: 'Testament Health' })))
      .toEqual([]);
  });
});

describe('a meeting HELD is never reported as zero', () => {
  /**
   * The funnel is emphatic: `meeting_booked` means "booked, not yet held", and nothing in the
   * system holds any claim that a meeting took place. Zero held would say the meetings were
   * booked and nobody came.
   */
  it('says the writer is missing, not that no meeting happened', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    expect(v.heldNote).toContain('gap in the writer');
    expect(v.heldNote).toContain('booked, not yet held');
    expect(v.heldNote).toContain('nobody came');
  });

  it('offers no held tier at all, so no number can be read as one', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    expect(v.tiers.map((t) => t.key)).toEqual(['meeting_booked', 'answered', 'replied']);
    expect(v.tiers.find((t) => t.key === 'meeting_held')).toBeUndefined();
  });
});

describe('the three tiers, and what is deliberately absent from them', () => {
  const mixed = [
    row({ id: 'm', outcome: 'booked_meeting', at: '2026-04-28' }),
    row({ id: 'n', outcome: 'answered', at: '2026-04-13' }),
    row({ id: 'o', outcome: 'replied', at: '2026-07-29' }),
  ];

  it('sorts every tier newest first', () => {
    const v = buildConversations([...REAL_NINE].reverse(), OPTS);
    const booked = v.tiers.find((t) => t.key === 'meeting_booked');
    expect(booked?.entries[0].at).toBe('2026-04-28');
    expect(booked?.entries[8].at).toBe('2026-03-23');
  });

  it('keeps the named counterparty on each entry', () => {
    const v = buildConversations(mixed, OPTS);
    expect(v.tiers.find((t) => t.key === 'answered')?.entries[0].name).toBe('Ryan Landry');
  });

  /**
   * Ali, 2026-09-09: "clicking on them should take you to the 360 dashboard." The frontend can
   * only build that link if the lead id survives this mapping, so it is asserted here rather
   * than trusted.
   */
  it('carries the lead id through, so the name can link to the 360', () => {
    const v = buildConversations(mixed, OPTS);
    expect(v.tiers.find((t) => t.key === 'answered')?.entries[0].leadId).toBe(1528);
  });

  it('carries a null lead id as null rather than inventing one', () => {
    const v = buildConversations([row({ leadId: null, name: null })], OPTS);
    expect(v.tiers[0].entries[0].leadId).toBeNull();
  });

  it('states what each tier is, in the schema\'s own terms', () => {
    const v = buildConversations(mixed, OPTS);
    expect(v.tiers[0].definition).toContain("outcome = 'booked_meeting'");
    expect(v.tiers[0].definition).toContain('not yet held');
  });

  /**
   * An open is the largest number available and the least meaningful: a tracking pixel fires
   * it, and Apple Mail fires it without a person reading anything.
   */
  it('explains that an open is not a conversation', () => {
    const v = buildConversations(mixed, OPTS);
    expect(v.provenance).toContain('An open is');
    expect(v.provenance).toContain('tracking pixel');
  });
});

describe('instruments that exist and hold nothing are named', () => {
  it('says the appointments table has never been written to', () => {
    const v = buildConversations(REAL_NINE, OPTS);
    const appts = v.silentSources.find((s) => s.label === 'appointments');
    expect(appts?.detail).toContain('never been written to');
    expect(appts?.detail).toContain('Zero rows');
  });

  it('breaks strategy calls down rather than reporting a bare total', () => {
    // 1 completed against 7 no-shows is the finding; "10 strategy calls" hides it.
    const v = buildConversations(REAL_NINE, OPTS);
    const calls = v.silentSources.find((s) => s.label === 'strategy_calls');
    expect(calls?.detail).toContain('10 in total');
    expect(calls?.detail).toContain('7 no_show');
    expect(calls?.detail).toContain('1 completed');
    expect(calls?.detail).toContain('Nothing since 2026-04-28');
  });

  it('says so when a source has never recorded anything', () => {
    const v = buildConversations(REAL_NINE, { ...OPTS, strategyCalls: [] });
    expect(v.silentSources.find((s) => s.label === 'strategy_calls')?.detail)
      .toContain('No strategy call has ever been recorded');
  });
});
