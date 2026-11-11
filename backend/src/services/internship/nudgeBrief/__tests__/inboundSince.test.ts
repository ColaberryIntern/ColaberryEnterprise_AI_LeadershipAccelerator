import { composeBrief } from '../compose';
import { holdFor } from '../hold';
import type { SidecarIntern } from '../../portfolioReport/sidecar/types';

/**
 * `inboundSince` - "have they written back since we last wrote to them?"
 *
 * ## The defect this file exists to pin down
 *
 * `hold.ts` carries an explicit protection, in its own words: "Someone who wrote back an hour
 * after our morning message is the most urgent person on the list, and a naive 'already messaged
 * today' would bury exactly them." That protection keys on `brief.inboundSince`.
 *
 * It could never fire. `inboundSince` was computed by walking `open_questions`, and
 * `open_questions` only ever holds mail that `classifyEmail` scored `question` or `stuck`. So the
 * question "did they reply?" was being answered by asking "did they ask me something?", and an
 * intern who replied with an ordinary progress update registered as not having replied at all.
 * The person the guard was written to protect was the one person it reliably buried.
 *
 * Measured on production 2026-11-11: `inboundSince` was null for 13 of 13 interns, so
 * `messaged_today` held the entire roster on the strength of a check that had no working input.
 *
 * ## Why the existing test suite did not catch it
 *
 * `hold.test.ts` has "does NOT hold someone who answered after our message", and it passes - but
 * it hands `inboundSince: '2026-11-10T15:50:00.000Z'` to `holdFor` as a literal. That proves the
 * CONSUMER honours the field. Nothing proved the PRODUCER could ever populate it. The tests below
 * drive `composeBrief` for exactly that reason, and the last one runs compose and hold together,
 * because the seam between them is where this lived.
 */

const OUR_MESSAGE = '2026-11-10T14:21:00.000Z';
const THEIR_REPLY = '2026-11-10T15:50:00.000Z';
const NOW = new Date('2026-11-10T18:00:00.000Z');

function intern(over: Partial<SidecarIntern> = {}): SidecarIntern {
  return {
    name: 'Quincy Nkwain Ninying', first_name: 'Quincy', enrollment_id: 'e1',
    track: 'agent', track_label: 'Platform Automation', link: null, day: 41,
    status: { key: 'ok', label: 'On track' }, chips: [],
    narrative: 'Quincy is well underway.', narrative_from_model: false, story: '',
    project: { name: 'Agent: Ellis', id: 'p1', kind: 'agent', repo_url: 'https://github.com/x/y', command_center_url: null, stage: 'build' },
    stories_verified: 47, stories_total: 136, percent_built: 35, overdue_tasks: 0,
    training: { weeks_completed: 12, weeks_total: 12, gate_cleared: true, gate_done: 3, gate_of: 3 },
    days_since_build_work: 3, build_work_in_window: true,
    counts: { verified: 47, commits: 20, asks: 1, blockers: 0, replies_from_ali: 4, stuck_events: 0, training_days: 30 },
    most_urgent: null, most_urgent_overflow: [], timeline: [], asking_you: [], asking_you_from_model: false,
    open_questions: [], nudge: '', artifacts: [], artifacts_raw_count: 0, artifacts_real_count: 24,
    asks: [{ key: 'capability_map', name: 'Capability Map', why: 'Build the one page per capability.', prompt: 'PROMPT', nudge: 'NUDGE' }],
    triage: { tier: 'on_track', reason: 'fine' },
    pacing: { day: 41, program_day_total: 84, program_day_total_basis: null, expected_training_week: 6, expected_basis: 'day_count', actual_training_week: 12, weeks_behind: 0 },
    last_ask: {
      sent_at: OUR_MESSAGE, from: 'ali@colaberry.com', subject: 'Where your decisions stand',
      body_text: 'Quincy, where do the six stand?', body_truncated: false, satisfied: null, satisfied_by: null,
    },
    last_inbound_at: null,
    communications: [],
    delta: null,
    ...over,
  } as SidecarIntern;
}

const compose = (over: Partial<SidecarIntern> = {}) =>
  composeBrief({ intern: intern(over), deadline: null, now: NOW });

describe('a reply that is not a question still counts as a reply', () => {
  /**
   * THE CONTROL. This is the production case: Quincy writes back ninety minutes after our
   * message, with a progress update rather than a question. `classifyEmail` scores that `update`,
   * so it never reached `open_questions`, so the old `inboundSince` returned null and the roster
   * got held.
   */
  it('reports inboundSince for an ordinary update sent after our last message', () => {
    expect(compose({ last_inbound_at: THEIR_REPLY }).inboundSince).toBe(THEIR_REPLY);
  });

  it('still reports it when open_questions is empty, which is the state production was in', () => {
    const brief = compose({ last_inbound_at: THEIR_REPLY, open_questions: [] });
    expect(brief.openQuestions).toEqual([]);
    expect(brief.inboundSince).toBe(THEIR_REPLY);
  });
});

describe('what inboundSince refuses to report', () => {
  it('is null when their newest mail predates our message, because then we are the ones owed nothing', () => {
    expect(compose({ last_inbound_at: '2026-11-09T09:00:00.000Z' }).inboundSince).toBeNull();
  });

  it('is null when they have never written', () => {
    expect(compose({ last_inbound_at: null }).inboundSince).toBeNull();
  });

  it('is null when a reply lands at the same instant as our message, since "since" means after', () => {
    expect(compose({ last_inbound_at: OUR_MESSAGE }).inboundSince).toBeNull();
  });

  it('survives an unparseable timestamp rather than throwing or inventing one', () => {
    expect(compose({ last_inbound_at: 'not a date' as unknown as string }).inboundSince).toBeNull();
  });

  /**
   * With no outbound recorded there is no "since" to measure from. Reporting their mail here would
   * claim we are waiting on an answer we never asked for.
   */
  it('is null when we have no record of writing to them at all', () => {
    expect(compose({ last_ask: null, last_inbound_at: THEIR_REPLY }).inboundSince).toBeNull();
  });
});

describe('older sidecars, which do not carry the field', () => {
  /**
   * `build.ts` reads saved collections, and the note on `SidecarInputs.conversations` says older
   * ones must still build. A sidecar written before this field existed has `undefined` here, and
   * must fall back to the open_questions scan rather than losing the signal entirely.
   */
  it('falls back to open_questions when last_inbound_at is absent', () => {
    const brief = composeBrief({
      intern: {
        ...intern({ open_questions: [{ received_at: THEIR_REPLY, subject: 'Blocked on the export', text: 'I am stuck.', kind: 'stuck' }] }),
        last_inbound_at: undefined as unknown as string | null,
      },
      deadline: null,
      now: NOW,
    });
    expect(brief.inboundSince).toBe(THEIR_REPLY);
  });

  it('takes the newer of the two sources when both are present', () => {
    const older = '2026-11-10T15:00:00.000Z';
    const brief = compose({
      last_inbound_at: older,
      open_questions: [{ received_at: THEIR_REPLY, subject: 'Blocked', text: 'I am stuck.', kind: 'stuck' }],
    });
    expect(brief.inboundSince).toBe(THEIR_REPLY);
  });
});

describe('the guard in hold.ts, driven end to end rather than hand-fed', () => {
  /**
   * The test this subsystem was missing: compose the brief from sidecar data and hand THAT to
   * `holdFor`, instead of constructing a brief with the answer already in it.
   */
  const withEmail = (brief: ReturnType<typeof compose>) => ({ ...brief, email: 'quincy@example.com' });

  it('does not bury someone who replied after our message today', () => {
    const brief = withEmail(compose({ last_inbound_at: THEIR_REPLY }));
    expect(brief.inboundSince).toBe(THEIR_REPLY);
    expect(holdFor({ brief, now: NOW })).toBeNull();
  });

  it('still holds someone we wrote to today who has said nothing back', () => {
    const brief = withEmail(compose({ last_inbound_at: null }));
    const decision = holdFor({ brief, now: NOW });
    expect(decision?.reason).toBe('messaged_today');
  });
});
