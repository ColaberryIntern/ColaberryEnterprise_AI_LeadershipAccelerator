jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { sequelize } from '../../../config/database';
import { correlateRecording, listRecordingsNeedingReview } from '../presentationRecordingCorrelation';

const q = sequelize.query as unknown as jest.Mock;

/**
 * The failure this file exists to prevent is one student's recording appearing on
 * another student's task. Demo day is one Zoom meeting for the whole cohort, so a
 * meeting-id match identifies the SESSION and says nothing about whose demo it is.
 */

const START = new Date('2026-11-20T19:10:00Z');
const END = new Date('2026-11-20T19:15:00Z');

const rec = (over: Record<string, unknown> = {}) => ({
  meetingId: '98765',
  occurrenceUuid: 'uuid-abc==',
  providerFileId: 'file-1',
  startedAt: START,
  endedAt: END,
  recordingType: 'shared_screen_with_speaker_view',
  provenance: 'webhook' as const,
  ...over,
});

/** A candidate row as the join returns it. */
const cand = (id: string, slotStart: string | null, dur: number | null = 300) => ({
  id, assignment_id: 'as-' + id, mode: 'cohort_live',
  slot_starts_at: slotStart ? new Date(slotStart) : null,
  slot_duration_seconds: dur,
});

const candidates = (rows: unknown[]) => q.mockResolvedValueOnce([rows, {}]);
const insertCreates = () => q.mockResolvedValueOnce([[{ id: 'r1' }], {}]);
const insertConflicts = () => q.mockResolvedValueOnce([[], {}]);
const anyUpdate = () => q.mockResolvedValueOnce([[], {}]);

const insertCall = () => q.mock.calls.find((c: any[]) => String(c[0]).includes('INSERT INTO presentation_recordings'));
const updateCall = () => q.mock.calls.find((c: any[]) => String(c[0]).includes('UPDATE presentation_attempts'));

beforeEach(() => { jest.clearAllMocks(); q.mockReset(); });

describe('a recording nobody is expecting is left alone', () => {
  it('reports unrelated when no attempt references the meeting', async () => {
    // The webhook subscription is account-wide: 1:1s and personal meetings arrive
    // here too. Writing a review row for each would bury the real ones.
    candidates([]);
    const r = await correlateRecording(rec());
    expect(r).toEqual({ kind: 'unrelated' });
    expect(insertCall()).toBeUndefined();
  });
});

describe('one attempt on the meeting is an unambiguous match', () => {
  it('attaches the recording and claims the occurrence onto the attempt', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();

    const r = await correlateRecording(rec());

    expect(r).toEqual({ kind: 'matched', attemptId: 'at1', recorded: true });
    expect(insertCall()![1].replacements).toMatchObject({
      aid: 'at1', uuid: 'uuid-abc==', fid: 'file-1', status: 'ingested', reason: null,
    });
  });

  it('never overwrites an occurrence an attempt already has', async () => {
    // Two occurrences on one attempt is itself a review case. Silently repointing
    // would destroy the evidence that it happened.
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    await correlateRecording(rec());
    expect(String(updateCall()![0])).toMatch(/occurrence_uuid IS NULL/);
  });

  it('is idempotent: a duplicate delivery conflicts and creates nothing', async () => {
    candidates([cand('at1', null, null)]);
    insertConflicts();
    anyUpdate();

    const r = await correlateRecording(rec());

    expect(r).toEqual({ kind: 'matched', attemptId: 'at1', recorded: false });
    expect(String(insertCall()![0])).toContain('ON CONFLICT (occurrence_uuid, provider_file_id) DO NOTHING');
  });
});

describe('demo day: one meeting, many students', () => {
  it('picks the presenter whose slot the recording falls in', async () => {
    candidates([
      cand('at-first', '2026-11-20T19:00:00Z'),
      cand('at-second', '2026-11-20T19:10:00Z'),
      cand('at-third', '2026-11-20T19:20:00Z'),
    ]);
    insertCreates();
    anyUpdate();

    const r = await correlateRecording(rec());

    expect(r.kind).toBe('matched');
    if (r.kind !== 'matched') return;
    expect(r.attemptId).toBe('at-second');
  });

  it('sends it to REVIEW rather than guessing when slots overlap', async () => {
    // Two slots covering the same minutes is a scheduling mistake, and attributing
    // the demo to whichever sorted first would hide it behind a wrong answer.
    candidates([
      cand('at-a', '2026-11-20T19:09:00Z', 600),
      cand('at-b', '2026-11-20T19:11:00Z', 600),
    ]);
    insertCreates();

    const r = await correlateRecording(rec());

    expect(r.kind).toBe('review');
    if (r.kind !== 'review') return;
    expect(r.reason).toBe('ambiguous_slot_match');
    expect(r.candidateAttemptIds).toEqual(['at-a', 'at-b']);
    expect(insertCall()![1].replacements.status).toBe('review');
    expect(String(insertCall()![1].replacements.reason)).toMatch(/cannot be attributed to one student/);
  });

  it('sends it to REVIEW when it falls in no slot at all', async () => {
    candidates([
      cand('at-a', '2026-11-20T21:00:00Z'),
      cand('at-b', '2026-11-20T21:10:00Z'),
    ]);
    insertCreates();

    const r = await correlateRecording(rec());

    expect(r.kind).toBe('review');
    if (r.kind !== 'review') return;
    expect(r.reason).toBe('no_slot_match');
    // Nothing was claimed onto an attempt.
    expect(updateCall()).toBeUndefined();
  });

  it('sends it to REVIEW when Zoom gave no start time, instead of picking the first slot', async () => {
    candidates([cand('at-a', '2026-11-20T19:00:00Z'), cand('at-b', '2026-11-20T19:10:00Z')]);
    insertCreates();

    const r = await correlateRecording(rec({ startedAt: null, endedAt: null }));

    expect(r.kind).toBe('review');
    if (r.kind !== 'review') return;
    expect(String(insertCall()![1].replacements.reason)).toMatch(/no recording start time/i);
  });

  it('a slot with no stated length does not swallow every later presenter', async () => {
    // An unbounded slot would match the 19:10 recording from a 19:00 start.
    candidates([cand('at-a', '2026-11-20T19:00:00Z', null), cand('at-b', '2026-11-20T19:10:00Z', 300)]);
    insertCreates();
    anyUpdate();

    const r = await correlateRecording(rec());

    // 19:00 + default 600s + grace still reaches 19:13, so BOTH overlap and the
    // honest answer is review rather than a coin flip.
    expect(r.kind).toBe('review');
  });
});

describe('a recording of the WHOLE session belongs to nobody', () => {
  it('classifies a full-length demo-day recording as the session, not as ambiguous', async () => {
    // Demo day is one unbroken recording of the whole cohort. Calling that
    // "ambiguous" sends EVERY demo day to review, and resolving it would end up
    // labelling a cohort-wide video as one student's demo.
    candidates([
      cand('at-a', '2026-11-20T19:00:00Z', 300),
      cand('at-b', '2026-11-20T19:10:00Z', 300),
      cand('at-c', '2026-11-20T19:20:00Z', 300),
    ]);
    insertCreates();

    const r = await correlateRecording(rec({
      startedAt: new Date('2026-11-20T19:00:00Z'),
      endedAt: new Date('2026-11-20T19:25:00Z'),
    }));

    expect(r.kind).toBe('session');
    if (r.kind !== 'session') return;
    expect(r.presenterCount).toBe(3);
    expect(r.attemptIds).toEqual(['at-a', 'at-b', 'at-c']);
    // Stored as ingested, NOT as a review item, and owned by no attempt.
    expect(insertCall()![1].replacements.status).toBe('ingested');
    expect(insertCall()![1].replacements.aid).toBe('00000000-0000-0000-0000-000000000000');
  });

  it('still calls a SHORT recording inside overlapping slots ambiguous', async () => {
    // REGRESSION GUARD. The first version of this rule used "overlaps every slot",
    // which a five-minute recording also does when two slots overlap each other —
    // quietly relabelling real ambiguity as a session recording and attaching a
    // range to someone who may not be in it. The rule is span, not count.
    candidates([
      cand('at-a', '2026-11-20T19:09:00Z', 600),
      cand('at-b', '2026-11-20T19:11:00Z', 600),
    ]);
    insertCreates();

    const r = await correlateRecording(rec({
      startedAt: new Date('2026-11-20T19:10:00Z'),
      endedAt: new Date('2026-11-20T19:15:00Z'),
    }));

    expect(r.kind).toBe('review');
    if (r.kind !== 'review') return;
    expect(r.reason).toBe('ambiguous_slot_match');
  });

  it('does not call a single presenter a session, however long the recording', async () => {
    candidates([cand('at-solo', '2026-11-20T19:00:00Z', 300)]);
    insertCreates();
    anyUpdate();

    const r = await correlateRecording(rec({
      startedAt: new Date('2026-11-20T19:00:00Z'),
      endedAt: new Date('2026-11-20T20:00:00Z'),
    }));

    // One candidate is a plain match, not a cohort session.
    expect(r.kind).toBe('matched');
  });

  it('cannot classify a session without recording timings', async () => {
    candidates([
      cand('at-a', '2026-11-20T19:00:00Z', 300),
      cand('at-b', '2026-11-20T19:10:00Z', 300),
    ]);
    insertCreates();

    const r = await correlateRecording(rec({ startedAt: null, endedAt: null }));

    // No timings means no span, so it falls through to review rather than being
    // guessed as the session.
    expect(r.kind).toBe('review');
  });
});

describe('a file Zoom cannot identify is never matched on a guess', () => {
  it('reviews when the per-file id is missing', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();

    const r = await correlateRecording(rec({ providerFileId: null }));

    expect(r.kind).toBe('review');
    if (r.kind !== 'review') return;
    expect(r.reason).toBe('missing_provider_file_id');
  });

  it('keys that review row deterministically, so a retry does not pile up duplicates', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    await correlateRecording(rec({ providerFileId: null }));
    // Derived from the occurrence, not random: the same delivery collides with
    // itself and yields one row.
    expect(insertCall()![1].replacements.fid).toBe('nofile:uuid-abc==');
  });
});

describe('the operations queue', () => {
  it('reads exactly the statuses that need a human', async () => {
    q.mockResolvedValueOnce([[{ id: 'r1' }], {}]);
    await listRecordingsNeedingReview();
    expect(String(q.mock.calls[0][0])).toMatch(/ingest_status IN \('missing', 'failed', 'review'\)/);
  });
});

/**
 * THE WIRING BETWEEN THE DERIVATION AND THE INSERT.
 *
 * `recordingFacts` is tested on its own and the webhook mapping is tested on its
 * own, and a mutation run on 2026-10-11 showed that neither notices if correlation
 * simply stops passing the derived values through — replacing them with `null`
 * reproduced the original defect and every test still passed.
 *
 * That is exactly how this class of bug has arrived twice already: the pure logic
 * was fine and the plumbing dropped the field. These tests watch the plumbing.
 */
describe('the derived facts actually reach the INSERT', () => {
  it('writes has_shared_screen derived from the recording type', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec({ recordingType: 'shared_screen_with_speaker_view' }));

    expect(insertCall()![1].replacements).toMatchObject({ screen: true });
  });

  it('writes has_shared_screen FALSE for a camera-only composition', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec({ recordingType: 'active_speaker' }));

    // The one case where `false` is correct, and the one that raises the
    // "your demo will not be visible" warning the learner needs before handing in.
    expect(insertCall()![1].replacements).toMatchObject({ screen: false });
  });

  it('writes duration_seconds computed from the two ends', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec());

    // The fixture runs 19:10:00 to 19:15:00.
    expect(insertCall()![1].replacements).toMatchObject({ dur: 300 });
  });

  it('writes NULL duration when the timings are missing rather than 0', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec({ startedAt: null, endedAt: null }));

    // A `0` here would print "0 seconds" beside a take the learner can watch.
    expect(insertCall()![1].replacements).toMatchObject({ dur: null });
  });

  it('passes has_audio through from the caller, and defaults it to NULL not false', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec({ hasAudio: true }));
    expect(insertCall()![1].replacements).toMatchObject({ audio: true });

    jest.clearAllMocks();
    q.mockReset();
    candidates([cand('at2', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    // Only the webhook sees the file list; the sweep cannot say. Unknown, not false.
    await correlateRecording(rec());
    expect(insertCall()![1].replacements).toMatchObject({ audio: null });
  });

  it('writes NULL screen for a composition type it does not recognise', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec({ recordingType: 'some_future_composition' }));

    expect(insertCall()![1].replacements).toMatchObject({ screen: null });
  });
});

/**
 * `recording_state` had ONE write site in the whole backend and it only ever set
 * `'processing'`, so every attempt that recorded sat there permanently while the
 * Practice panel read that column to tell the learner where their take was.
 */
describe('an attributed recording moves the attempt off processing', () => {
  const readyCall = () => q.mock.calls.find((c: any[]) => String(c[0]).includes("recording_state = 'ready'"));

  it('sets the attempt to ready', async () => {
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec());

    expect(readyCall()).toBeDefined();
    expect(readyCall()![1].replacements).toMatchObject({ aid: 'at1' });
  });

  it('only advances from expected or processing, never over a human decision', async () => {
    // A `review` or `failed` state somebody set deliberately must not be trampled
    // by a late re-delivery.
    candidates([cand('at1', null, null)]);
    insertCreates();
    anyUpdate();
    anyUpdate();

    await correlateRecording(rec());

    expect(String(readyCall()![0])).toContain("recording_state IN ('expected', 'processing')");
  });

  it('does NOT mark ready when the recording was parked for review', async () => {
    // No owner means nothing to mark. Advancing here would say a take is ready
    // when nobody knows whose it is.
    candidates([cand('at1', null, null)]);
    insertCreates();

    await correlateRecording(rec({ providerFileId: null }));

    expect(readyCall()).toBeUndefined();
  });
});
