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
