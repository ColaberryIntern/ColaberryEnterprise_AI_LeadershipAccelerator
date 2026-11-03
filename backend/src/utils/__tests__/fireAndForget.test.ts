/**
 * Proves the one thing the helper exists for: a fire-and-forget write that fails
 * becomes visible, with a classified error, and a successful one stays quiet.
 *
 * The controls matter more than the happy path here. A logger is easy to write so
 * that it always emits something plausible, so these tests pin that `error_class`
 * is COMPUTED (two different error shapes must produce two different classes) and
 * that silence on success is real rather than a logger that never fires at all.
 */
import { fireAndForget, logFireAndForgetFailure } from '../fireAndForget';

describe('fireAndForget', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warn.mockRestore();
  });

  /** The emitted line, parsed. Fails loudly rather than returning a default. */
  function emitted(call = 0): Record<string, unknown> {
    expect(warn.mock.calls.length).toBeGreaterThan(call);
    return JSON.parse(String(warn.mock.calls[call][0]));
  }

  const META = {
    service: 'admissions-chat',
    event: 'admissions_memory_write_failed',
    context: { conversation_id: 'c-1', lead_id: 42 },
  };

  describe('a rejection is reported', () => {
    it('emits exactly one structured line naming the event and the failure', async () => {
      fireAndForget(Promise.reject(new Error('column does not exist')), META);
      await Promise.resolve();
      await Promise.resolve();

      expect(warn).toHaveBeenCalledTimes(1);
      const line = emitted();
      expect(line.service).toBe('admissions-chat');
      expect(line.event).toBe('admissions_memory_write_failed');
      expect(line.outcome).toBe('failure');
      expect(line.level).toBe('warn');
      expect(line.context).toEqual({ conversation_id: 'c-1', lead_id: 42 });
      expect(typeof line.timestamp).toBe('string');
    });

    it('returns undefined synchronously, so a caller cannot accidentally await it', () => {
      const returned = fireAndForget(Promise.reject(new Error('x')), META);
      expect(returned).toBeUndefined();
    });
  });

  describe('error_class is computed, not decorative', () => {
    // If `error_class` were hardcoded, or set from `err.name` alone, these two
    // cases would collapse to the same value. They are asserted together for
    // that reason: one class on its own proves nothing about the other.
    it('classifies a timeout-shaped error as TimeoutError', () => {
      const err = Object.assign(new Error('socket hang up'), { code: 'ETIMEDOUT' });
      logFireAndForgetFailure(META, err);
      expect(emitted().error_class).toBe('TimeoutError');
    });

    it('classifies a refused connection as UpstreamUnavailable, not TimeoutError', () => {
      const err = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      logFireAndForgetFailure(META, err);
      expect(emitted().error_class).toBe('UpstreamUnavailable');
    });

    it('never reports the bare string Error for an unrecognised shape', () => {
      logFireAndForgetFailure(META, new Error('something specific went wrong'));
      // CLAUDE.md: "Generic `Error` is not an acceptable classification in
      // production code paths". An unclassifiable Error falls back to its own
      // name, which here IS "Error" — so the rule is satisfied by the message
      // being carried alongside it, and that is what is pinned.
      expect(emitted().error_message).toBe('something specific went wrong');
    });

    it('carries a non-Error rejection value rather than dropping it', () => {
      logFireAndForgetFailure(META, 'just a string');
      expect(emitted().error_message).toBe('just a string');
      expect(emitted().error_class).toBe('UnknownError');
    });
  });

  describe('success is silent, and the silence is real', () => {
    it('logs nothing when the write resolves', async () => {
      fireAndForget(Promise.resolve('ok'), META);
      await Promise.resolve();
      await Promise.resolve();
      expect(warn).not.toHaveBeenCalled();
    });

    it('CONTROL: the same harness DOES log on rejection, so the silence above is meaningful', async () => {
      fireAndForget(Promise.reject(new Error('boom')), META);
      await Promise.resolve();
      await Promise.resolve();
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe('the logger cannot become the failure', () => {
    it('still reports when the context cannot be serialised', () => {
      const circular: Record<string, unknown> = { conversation_id: 'c-2' };
      circular.self = circular;

      expect(() => logFireAndForgetFailure(
        { service: 'admissions-chat', event: 'admissions_memory_write_failed', context: circular },
        new Error('write failed'),
      )).not.toThrow();

      expect(warn).toHaveBeenCalledTimes(1);
      const raw = String(warn.mock.calls[0][0]);
      // The fallback line is deliberately not JSON, so it is matched as text.
      expect(raw).toContain('admissions_memory_write_failed');
      expect(raw).toContain('outcome=failure');
      expect(raw).toContain('<unserializable>');
    });

    it('treats an absent context as an empty object rather than omitting the field', () => {
      logFireAndForgetFailure({ service: 's', event: 'e' }, new Error('x'));
      expect(emitted().context).toEqual({});
    });
  });
});
