import { formatDuration, logIdFor, processDirectCompletion, toCompletion, type DirectCallRow, type DirectDeps } from '../directCompletion';
import { rememberTranscript, transcriptFor } from '../directCompletionRuntime';

const CALL = '3e4f5061-7283-4940-8abb-ddeeff001122';
const TRANSCRIPT = 'Agent: Hi, this is Colaberry. Caller: I want to hear about the program.';
const row = (p: Partial<DirectCallRow> = {}): DirectCallRow => ({ id: CALL, engine: 'conversation_relay', state: 'completed', lead_id: 42, provider_call_id: 'CA' + 'e1'.repeat(16), test_mode: false, human_answered: true, duration_seconds: 65, purpose: 'interest', ...p });

/** An in-memory stand-in for the claims, with the same semantics as the SQL (one winner, lease). */
function fakeDeps(over: Partial<DirectDeps> = {}, call: DirectCallRow | null = row(), transcript = TRANSCRIPT) {
  const claims = new Map<string, 'claimed' | 'done'>();
  const completions = new Set<string>();
  const timeline: string[] = [];
  const extractions: string[] = [];
  const reviews: string[] = [];
  const attempts = new Map<string, number>();
  const d: DirectDeps = {
    loadCall: async () => call,
    ensureLog: async (_c, id) => id,
    claimCompletion: async (logId, c) => { const k = `${logId}:${c.status}`; const first = !completions.has(k); completions.add(k); return { firstDelivery: first }; },
    claimEffect: async (logId, e) => {
      const k = `${logId}:${e}`;
      if (claims.has(k) || (attempts.get(k) ?? 0) >= 3) return false;
      claims.set(k, 'claimed'); attempts.set(k, (attempts.get(k) ?? 0) + 1); return true;
    },
    releaseEffect: async (logId, e) => { if (claims.get(`${logId}:${e}`) === 'claimed') claims.delete(`${logId}:${e}`); },
    storedTranscript: async () => '',
    markTranscriptReview: async (_l, reason) => { reviews.push(reason); },
    clearTranscriptReview: async () => { reviews.push('cleared'); },
    writeTimeline: async (logId, _lead, subject) => { timeline.push(subject); claims.set(`${logId}:timeline`, 'done'); },
    extract: async () => { extractions.push('x'); },
    markEffectDone: async (logId, e) => { claims.set(`${logId}:${e}`, 'done'); },
    leadFirstName: async () => 'Pat Doe',
    transcriptFor: () => transcript,
    log: () => undefined,
    ...over,
  };
  return { d, timeline, extractions, claims, reviews };
}

describe('processDirectCompletion (VS3.2 exactly once)', () => {
  it('first delivery: one log, one timeline entry, one extraction', async () => {
    const f = fakeDeps();
    const r = await processDirectCompletion(CALL, f.d);
    expect(r).toMatchObject({ done: true, firstDelivery: true, timeline: true, extraction: true, transcriptState: 'present', logId: logIdFor(CALL) });
    expect(f.timeline).toEqual(['Cory called Pat (1m 5s)']);
    expect(f.extractions).toHaveLength(1);
  });

  it('duplicate: the same completion processed again (status callback + transcript + sweep) writes nothing new', async () => {
    const f = fakeDeps();
    await processDirectCompletion(CALL, f.d);
    const again = await Promise.all([processDirectCompletion(CALL, f.d), processDirectCompletion(CALL, f.d)]);
    for (const r of again) expect(r).toMatchObject({ done: true, firstDelivery: false, timeline: false, extraction: false });
    expect(f.timeline).toHaveLength(1);
    expect(f.extractions).toHaveLength(1);
  });

  it('delayed transcript: status first (no transcript) -> pending review; transcript later -> extraction once', async () => {
    let t = '';
    const f = fakeDeps({ transcriptFor: () => t });
    const first = await processDirectCompletion(CALL, f.d);
    expect(first).toMatchObject({ transcriptState: 'pending_review', timeline: true, extraction: false });
    t = TRANSCRIPT;
    const later = await processDirectCompletion(CALL, f.d);
    expect(later).toMatchObject({ transcriptState: 'present', extraction: true, timeline: false });
    expect(f.extractions).toHaveLength(1);
    expect(f.timeline).toHaveLength(1);
  });

  it('a completed call without a usable transcript is never extracted (null transcript is not success)', async () => {
    const f = fakeDeps({}, row(), '');
    expect(await processDirectCompletion(CALL, f.d)).toMatchObject({ transcriptState: 'pending_review', extraction: false });
    expect(f.extractions).toHaveLength(0);
  });

  it('lost DB response on the timeline write: the claim is released so a retry can finish it once', async () => {
    let fail = true;
    const f = fakeDeps();
    const base = f.d.writeTimeline;
    f.d.writeTimeline = async (...a) => { if (fail) { fail = false; throw Object.assign(new Error('connection reset'), { name: 'ConnectionError' }); } return base(...a); };
    const r1 = await processDirectCompletion(CALL, f.d);
    expect(r1).toMatchObject({ timeline: false });
    const r2 = await processDirectCompletion(CALL, f.d);
    expect(r2).toMatchObject({ timeline: true });
    expect(f.timeline).toHaveLength(1);
  });

  it('failed extraction leaves the transcript PENDING REVIEW, releases its claim, and a retry clears it once', async () => {
    let fail = true;
    const f = fakeDeps({ extract: async () => { if (fail) { fail = false; throw new Error('openai 503'); } } });
    expect(await processDirectCompletion(CALL, f.d)).toMatchObject({ extraction: false, transcriptState: 'pending_review' });
    expect(f.reviews).toEqual(['extraction_failed']);
    expect(await processDirectCompletion(CALL, f.d)).toMatchObject({ extraction: true, transcriptState: 'present' });
    expect(f.reviews).toEqual(['extraction_failed', 'cleared']);
    expect(await processDirectCompletion(CALL, f.d)).toMatchObject({ extraction: false });
  });

  it('an extraction that keeps failing stops after 3 attempts and stays pending review', async () => {
    const f = fakeDeps({ extract: async () => { throw new Error('openai 503'); } });
    for (let i = 0; i < 5; i++) await processDirectCompletion(CALL, f.d);
    expect(f.reviews).toEqual(['extraction_failed', 'extraction_failed', 'extraction_failed']);
  });

  it('after a restart (no transcript in memory) a retry uses the transcript stored on the log', async () => {
    const seen: string[] = [];
    const f = fakeDeps({ storedTranscript: async () => TRANSCRIPT, extract: async (_l, t) => { seen.push(t); } }, row(), '');
    expect(await processDirectCompletion(CALL, f.d)).toMatchObject({ extraction: true, transcriptState: 'present' });
    expect(seen).toEqual([TRANSCRIPT]);
  });

  it('skips: unknown call, a call still in progress, a test-mode call', async () => {
    expect(await processDirectCompletion(CALL, fakeDeps({}, null).d)).toEqual({ done: false, reason: 'unknown_call' });
    expect(await processDirectCompletion(CALL, fakeDeps({}, row({ state: 'session_active' })).d)).toEqual({ done: false, reason: 'not_ended' });
    expect(await processDirectCompletion(CALL, fakeDeps({}, row({ test_mode: true })).d)).toEqual({ done: false, reason: 'test_mode' });
  });

  it('a call with no lead records the completion only; a no-answer reads as a missed call', async () => {
    const noLead = fakeDeps({}, row({ lead_id: null }));
    expect(await processDirectCompletion(CALL, noLead.d)).toMatchObject({ done: true, timeline: false, extraction: false });
    const missed = fakeDeps({}, row({ state: 'no_answer', human_answered: false, duration_seconds: null }), '');
    await processDirectCompletion(CALL, missed.d);
    expect(missed.timeline).toEqual(['Cory tried to call Pat (no answer)']);
  });
});

describe('helpers', () => {
  it('logIdFor is a stable, valid UUID per call', () => {
    expect(logIdFor(CALL)).toBe(logIdFor(CALL));
    expect(logIdFor(CALL)).not.toBe(logIdFor('other'));
    expect(logIdFor(CALL)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('toCompletion counts success only when a person answered', () => {
    expect(toCompletion(row({ human_answered: false }), TRANSCRIPT).completed).toBe(false);
    expect(toCompletion(row(), TRANSCRIPT)).toMatchObject({ provider: 'conversation_relay', completed: true, status: 'completed' });
  });
  it('formatDuration', () => {
    expect(formatDuration(65)).toBe(' (1m 5s)');
    expect(formatDuration(9)).toBe(' (9s)');
    expect(formatDuration(null)).toBe('');
  });
  it('transcript hand-off is held for 30 minutes, then forgotten', () => {
    rememberTranscript('c-1', 'hello', 1_000);
    expect(transcriptFor('c-1', 1_000 + 29 * 60_000)).toBe('hello');
    expect(transcriptFor('c-1', 1_000 + 31 * 60_000)).toBe('');
  });
});
