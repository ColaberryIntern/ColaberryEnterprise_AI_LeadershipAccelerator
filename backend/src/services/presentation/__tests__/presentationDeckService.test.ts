/**
 * Deck generation: bounded, instrumented, and honest when it fails.
 *
 * The three rules these tests exist to defend:
 *   1. The cap is real. At most MAX_TRIES model calls per generation — a retry loop
 *      without a ceiling spends real money in a tight circle.
 *   2. Only transient failures are retried. Retrying an auth error three times pays
 *      three times to be told the same thing.
 *   3. A failure is a ROW, with its class and try count, and it is retryable. "Nothing
 *      happened" and "it timed out three times" must not look the same.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

const mockCreate = jest.fn();
const mockFactory = jest.fn(() => ({ chat: { completions: { create: mockCreate } } }));
jest.mock('../../openaiInstrumented', () => ({ getInstrumentedOpenAI: (...a: any[]) => mockFactory(...a) }));

import { sequelize } from '../../../config/database';
import {
  generateDeck, latestDeck, isRetryable, backoffMs, promptSha, MAX_TRIES,
} from '../presentationDeckService';

const q = sequelize.query as unknown as jest.Mock;

const ASSIGNMENT = '11111111-2222-4333-8444-555555555555';
const PROMPT = 'Build a five minute demo deck for a courier routing system.';
const PV = 'ai_visual_presentation@3';

const dbRow = (over: Record<string, unknown> = {}) => ({
  id: 'deck-1', assignment_id: ASSIGNMENT, attempt_no: 1, state: 'generating',
  model: 'gpt-4o', prompt_version: PV, tries: 0, error_class: null, content_html: null, ...over,
});

/** The claim insert, then however many finishes the test needs. */
function wireDb(claim: any = [[dbRow()], {}]) {
  q.mockReset();
  q.mockResolvedValueOnce(claim);
  q.mockResolvedValue([[dbRow({ state: 'ready', content_html: '<section>deck</section>', tries: 1 })], {}]);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => undefined);
  mockCreate.mockReset();
  mockFactory.mockClear();
});
afterEach(() => { (console.log as jest.Mock).mockRestore?.(); });

const ok = () => ({ choices: [{ message: { content: '<section>deck</section>' } }] });
/**
 * Errors shaped the way classifyError actually reads them - name, code, status - not a
 * bespoke `error_class` field, which it ignores. The first version of this helper set
 * `error_class` and passed anyway, because the message "boom TimeoutError" happens to
 * contain the substring the classifier falls back to.
 */
const ERRORS: Record<string, () => any> = {
  TimeoutError: () => Object.assign(new Error('socket hang up'), { code: 'ETIMEDOUT' }),
  RateLimitError: () => Object.assign(new Error('slow down'), { status: 429 }),
  UpstreamUnavailable: () => Object.assign(new Error('bad gateway'), { status: 502 }),
  AuthError: () => Object.assign(new Error('nope'), { status: 401 }),
  ValidationError: () => Object.assign(new Error('bad request'), { status: 400 }),
  ContractViolation: () => Object.assign(new Error('empty'), { name: 'ContractViolation' }),
};
const fail = (cls: string) => ERRORS[cls]();

/** Claim succeeds, then every later query returns the FAILED row the finish writes. */
function wireDbFailing(errorClass: string, tries: number) {
  q.mockReset();
  q.mockResolvedValueOnce([[dbRow()], {}]);
  q.mockResolvedValue([[dbRow({ state: 'failed', error_class: errorClass, tries })], {}]);
}
describe('it goes through the instrumented client, never a bare one', () => {
  it('names the workflow and the prompt version, so cost lands on a template', async () => {
    wireDb();
    mockCreate.mockResolvedValue(ok());
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(mockFactory).toHaveBeenCalledWith({ workflow_id: 'presentation_deck', prompt_version: PV });
  });

  it('sets an explicit timeout, so a hung call cannot hold the slot forever', async () => {
    wireDb();
    mockCreate.mockResolvedValue(ok());
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(mockCreate.mock.calls[0][1]).toMatchObject({ timeout: expect.any(Number) });
  });
});

describe('the retry cap is real', () => {
  it(`stops at ${MAX_TRIES} model calls when every attempt is transient`, async () => {
    wireDbFailing('TimeoutError', MAX_TRIES);
    mockCreate.mockRejectedValue(fail('TimeoutError'));

    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });

    expect(mockCreate).toHaveBeenCalledTimes(MAX_TRIES);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe('exhausted');
  });

  // Retrying an auth error costs money to be told the same thing.
  it.each(['AuthError', 'ValidationError', 'ContractViolation'])(
    'does not retry a %s — one call, then it stops', async (cls) => {
      wireDbFailing(cls, 1);
      mockCreate.mockRejectedValue(fail(cls));

      await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
      expect(mockCreate).toHaveBeenCalledTimes(1);
    },
  );

  it('succeeds on a later attempt without burning the rest of the cap', async () => {
    wireDb();
    mockCreate.mockRejectedValueOnce(fail('RateLimitError')).mockResolvedValueOnce(ok());
    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  // An ALLOW-list, not a deny-list: an unclassified failure is not retried by default.
  it('classifies what may be retried, and an unknown class may not', () => {
    expect(isRetryable(fail('TimeoutError'))).toBe(true);
    expect(isRetryable(fail('RateLimitError'))).toBe(true);
    expect(isRetryable(fail('UpstreamUnavailable'))).toBe(true);
    expect(isRetryable(fail('AuthError'))).toBe(false);
    expect(isRetryable(new Error('something nobody has classified'))).toBe(false);
  });

  it('backs off exponentially rather than hammering', () => {
    expect(backoffMs(1)).toBeLessThan(backoffMs(2));
    expect(backoffMs(2)).toBeLessThan(backoffMs(3));
  });
});

describe('a failure is a row, and it is retryable', () => {
  it('records the class and the try count rather than vanishing', async () => {
    wireDbFailing('TimeoutError', MAX_TRIES);
    mockCreate.mockRejectedValue(fail('TimeoutError'));

    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    if (r.ok) throw new Error('expected failure');
    expect(r.deck).toMatchObject({ state: 'failed', errorClass: 'TimeoutError', tries: MAX_TRIES });

    const update = q.mock.calls.find((c) => String(c[0]).includes('UPDATE presentation_decks'))!;
    expect(String(update[0])).toContain('finished_at = NOW()');
  });

  it('offers another go after a failure — the cap bounds ONE generation, not the student', async () => {
    q.mockReset();
    q.mockResolvedValueOnce([[dbRow({ state: 'failed', error_class: 'TimeoutError', tries: 3 })], {}]);
    const r = await latestDeck(ASSIGNMENT);
    expect(r.retryable).toBe(true);
    expect(r.deck?.state).toBe('failed');
  });

  it('does not offer a retry over a deck that is ready', async () => {
    q.mockReset();
    q.mockResolvedValueOnce([[dbRow({ state: 'ready', content_html: '<section/>' })], {}]);
    const r = await latestDeck(ASSIGNMENT);
    expect(r.retryable).toBe(false);
  });

  it('no deck at all is retryable, not an error', async () => {
    q.mockReset();
    q.mockResolvedValueOnce([[], {}]);
    await expect(latestDeck(ASSIGNMENT)).resolves.toEqual({ deck: null, retryable: true });
  });
});

describe('what it refuses to do', () => {
  // A 200 carrying nothing is a contract violation. Storing it would mark an empty
  // deck "ready" and the student would open a blank page.
  it('refuses to call an empty response a deck', async () => {
    wireDbFailing('ContractViolation', 1);
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '   ' } }] });

    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(r.ok).toBe(false);
    // Not transient, so it is not retried.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('will not start a second generation while one is in flight', async () => {
    // The partial unique index means the losing INSERT returns no row.
    q.mockReset();
    q.mockResolvedValueOnce([[], {}]);
    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(r).toEqual({ ok: false, reason: 'already_generating' });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('claims the slot with ON CONFLICT DO NOTHING, not a read-then-write', async () => {
    wireDb();
    mockCreate.mockResolvedValue(ok());
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect(String(q.mock.calls[0][0])).toContain('ON CONFLICT DO NOTHING');
  });

  it('refuses an empty prompt without spending anything', async () => {
    q.mockReset();
    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: '   ', promptVersion: PV });
    expect(r).toEqual({ ok: false, reason: 'no_prompt' });
    expect(q).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe('the prompt that produced a deck is frozen with it', () => {
  // Re-deriving the prompt later gives a different string the moment the student edits
  // their project, and then "why did it generate that" has no answer.
  it('stores a sha of what was actually sent', async () => {
    wireDb();
    mockCreate.mockResolvedValue(ok());
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    expect((q.mock.calls[0][1] as any).replacements.sha).toBe(promptSha(PROMPT));
    expect(promptSha(PROMPT)).not.toBe(promptSha(`${PROMPT} edited`));
  });
});

/**
 * The grounding check runs on the way IN, and its verdict is stored with the deck.
 *
 * Recomputing it on read would mean the same deck silently changes which of its
 * numbers look invented the moment the student edits their project.
 */
describe('a generated deck is checked against what the student actually wrote', () => {
  const FABRICATED = '<section><p>Cut costs by 37%.</p><p>Handles 1,200 deliveries.</p></section>';
  const SOURCES = ['We handle 1,200 deliveries a week.'];

  it('stores the unsupported figures alongside the deck', async () => {
    wireDb();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: FABRICATED } }] });

    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV, sources: SOURCES });

    const update = q.mock.calls.find((c) => String(c[0]).includes('UPDATE presentation_decks'))!;
    const stored = JSON.parse((update[1] as any).replacements.grounding);
    const flagged = stored.unsupported.map((u: any) => u.normalized);
    expect(flagged).toContain('37');
    // The student supplied 1,200, so it must not be flagged.
    expect(flagged).not.toContain('1200');
    expect(stored.clean).toBe(false);
  });

  it('writes a clean verdict when every figure is the student\'s own', async () => {
    wireDb();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '<p>Handles 1200 deliveries.</p>' } }] });
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV, sources: SOURCES });
    const update = q.mock.calls.find((c) => String(c[0]).includes('UPDATE presentation_decks'))!;
    expect(JSON.parse((update[1] as any).replacements.grounding).clean).toBe(true);
  });

  // With no sources every figure is unsupported, which is the honest answer rather
  // than a reason to skip the check.
  it('flags everything when the student supplied nothing', async () => {
    wireDb();
    mockCreate.mockResolvedValue({ choices: [{ message: { content: '<p>Up 55%.</p>' } }] });
    await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV });
    const update = q.mock.calls.find((c) => String(c[0]).includes('UPDATE presentation_decks'))!;
    expect(JSON.parse((update[1] as any).replacements.grounding).unsupported).toHaveLength(1);
  });

  // A flagged deck is still a deck. Refusing to store it would lose the student's work
  // over a number they may well be able to confirm.
  it('still returns the deck as ready when figures are flagged', async () => {
    q.mockReset();
    q.mockResolvedValueOnce([[dbRow()], {}]);
    q.mockResolvedValue([[dbRow({
      state: 'ready', content_html: FABRICATED, tries: 1,
      grounding_json: { unsupported: [{ text: '37%', normalized: '37', context: 'Cut costs by 37%' }] },
    })], {}]);
    mockCreate.mockResolvedValue({ choices: [{ message: { content: FABRICATED } }] });

    const r = await generateDeck({ assignmentId: ASSIGNMENT, prompt: PROMPT, promptVersion: PV, sources: SOURCES });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.deck.state).toBe('ready');
    expect(r.deck.unsupported.map((u) => u.text)).toEqual(['37%']);
  });
});
