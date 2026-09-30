/**
 * certAnalytics — what must never reach the event log.
 *
 * The bank is the product and a student's answers are theirs. An analytics table
 * is a far weaker boundary than the serving path, so the sanitizer is tested
 * against the actual forbidden field names rather than trusted to be remembered
 * at each call site.
 */
jest.mock('../../aiEventService', () => ({ emitAiEvent: jest.fn().mockResolvedValue(undefined) }));

import { emitAiEvent } from '../../aiEventService';
import {
  sanitize, certEvent, scoringFailed, formGenerationFailed,
  duplicateAwardAttempt, blueprintStale,
} from '../certAnalytics';

const mEmit = emitAiEvent as unknown as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('sanitize — question content and answers never reach the log', () => {
  it('strips every answer-bearing and content-bearing field', () => {
    const dirty = {
      question_key: 'A1', domain_id: 'D1', time_ms: 4200,   // keep
      stem: 'Why isolate a subagent context?',               // strip
      options: [{ key: 'A', text: 'x' }],
      correct_keys: ['B'],
      rationale: 'because…',
      distractor_rationales: { A: 'no' },
      selected_keys: ['B'],
      answer: 'B',
      content: 'free text',
    };
    const clean = sanitize(dirty);
    expect(clean).toEqual({ question_key: 'A1', domain_id: 'D1', time_ms: 4200 });
  });

  it('strips them when NESTED, not just at the top level', () => {
    const clean = sanitize({ session: { id: 's1', stem: 'leaked?', nested: { correct_keys: ['B'], ok: 1 } } });
    expect(clean).toEqual({ session: { id: 's1', nested: { ok: 1 } } });
    expect(JSON.stringify(clean)).not.toContain('leaked?');
  });

  it('sanitizes objects inside arrays', () => {
    const clean = sanitize({ items: [{ question_key: 'A1', rationale: 'secret' }] });
    expect(JSON.stringify(clean)).not.toContain('secret');
    expect(clean.items[0].question_key).toBe('A1');
  });

  it('keeps arrays of scalars — a domain list is not sensitive', () => {
    expect(sanitize({ domain_ids: ['D1', 'D2'] })).toEqual({ domain_ids: ['D1', 'D2'] });
  });

  it('boundary: null and undefined become an empty object, never a crash', () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize(undefined)).toEqual({});
    expect(sanitize({})).toEqual({});
  });
});

describe('certEvent', () => {
  it('routes through the canonical ai_events rail, tagged as cert_prep', async () => {
    await certEvent({ event: 'cert.viewed', enrollmentId: 'e1', metadata: { week: 9 } });
    expect(mEmit).toHaveBeenCalledWith(expect.objectContaining({
      event_type: 'cert.viewed',
      outcome: 'success',
      actor_type: 'student',
      user_id: 'e1',
      external_system: 'cert_prep',
      metadata: { week: 9 },
    }));
  });

  it('sanitizes on the way out — a careless call site cannot leak', async () => {
    await certEvent({ event: 'cert.question.answered', enrollmentId: 'e1',
      metadata: { question_key: 'A1', stem: 'LEAK', selected_keys: ['B'], is_correct: true } });
    const sent = mEmit.mock.calls[0][0].metadata;
    expect(sent).toEqual({ question_key: 'A1', is_correct: true });
    expect(JSON.stringify(sent)).not.toContain('LEAK');
  });

  it('NEVER throws, even if the telemetry rail does — a failed log must not fail a session', async () => {
    mEmit.mockRejectedValueOnce(new Error('event store down'));
    await expect(certEvent({ event: 'cert.viewed', enrollmentId: 'e1' })).resolves.toBeUndefined();
  });
});

describe('operational signals', () => {
  it('scoringFailed records the error class but truncates the message', async () => {
    await scoringFailed('e1', 's1', Object.assign(new Error('x'.repeat(400)), { name: 'RangeError' }));
    const call = mEmit.mock.calls[0][0];
    expect(call.outcome).toBe('failure');
    expect(call.error_class).toBe('RangeError');
    expect(call.metadata.message.length).toBeLessThanOrEqual(200);
  });

  it('formGenerationFailed carries the reason — usually an empty domain in the bank', async () => {
    await formGenerationFailed('e1', 'mock', 'CERT_NO_APPROVED_QUESTIONS');
    expect(mEmit.mock.calls[0][0]).toMatchObject({
      event_type: 'cert.form.generation_failed',
      outcome: 'failure',
      metadata: { mode: 'mock', reason: 'CERT_NO_APPROVED_QUESTIONS' },
    });
  });

  it('a duplicate award is "blocked", not "failure" — the idempotency key did its job', async () => {
    await duplicateAwardAttempt('e1', 'cert_mock_complete:s1');
    expect(mEmit.mock.calls[0][0].outcome).toBe('blocked'); // nothing failed - a second write was refused
  });

  it('blueprintStale flags that readiness is a coverage estimate, not exam-weighted', async () => {
    await blueprintStale('ccar-f', '1.0-2026-07', 'unverified');
    expect(mEmit.mock.calls[0][0]).toMatchObject({
      event_type: 'cert.blueprint.stale',
      metadata: { blueprint_source: 'unverified' },
    });
  });
});
