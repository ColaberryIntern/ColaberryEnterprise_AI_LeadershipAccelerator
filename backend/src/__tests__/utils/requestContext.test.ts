import { runWithRequestContext, getTraceId, ensureTraceId } from '../../utils/requestContext';

describe('requestContext.ensureTraceId (P1-4 — never-null trace id)', () => {
  it('returns an explicit id when provided', () => {
    expect(ensureTraceId('explicit-123')).toBe('explicit-123');
  });

  it('returns the current context id inside runWithRequestContext', () => {
    runWithRequestContext({ traceId: 'ctx-abc' }, () => {
      expect(ensureTraceId()).toBe('ctx-abc');
      expect(getTraceId()).toBe('ctx-abc');
    });
  });

  it('explicit id wins over the surrounding context id', () => {
    runWithRequestContext({ traceId: 'ctx-abc' }, () => {
      expect(ensureTraceId('explicit-123')).toBe('explicit-123');
    });
  });

  it('mints a fresh uuid when there is no context and no explicit id (background callers)', () => {
    expect(getTraceId()).toBeUndefined(); // outside any context
    const a = ensureTraceId();
    const b = ensureTraceId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(a).not.toBe(b); // a fresh id each call (per-call correlation, never null)
  });
});
