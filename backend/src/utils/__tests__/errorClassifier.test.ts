/**
 * classifyError — BC #10099862873 (P1, item 2). No classifier helper
 * existed anywhere in the repo before this; every call site either tagged
 * nothing or fell back to the literal string 'Error', itself a violation
 * of CLAUDE.md's "generic Error is not an acceptable classification" rule.
 */
import { classifyError } from '../errorClassifier';

describe('classifyError', () => {
  it('happy path: JWT-specific error names map to AuthError', () => {
    expect(classifyError({ name: 'TokenExpiredError' })).toBe('AuthError');
    expect(classifyError({ name: 'JsonWebTokenError' })).toBe('AuthError');
    expect(classifyError({ name: 'NotBeforeError' })).toBe('AuthError');
  });

  it('happy path: ZodError maps to ValidationError', () => {
    expect(classifyError({ name: 'ZodError' })).toBe('ValidationError');
  });

  it('happy path: network error codes map to UpstreamUnavailable', () => {
    expect(classifyError({ code: 'ECONNREFUSED' })).toBe('UpstreamUnavailable');
    expect(classifyError({ code: 'ENOTFOUND' })).toBe('UpstreamUnavailable');
    expect(classifyError({ message: 'fetch failed' })).toBe('UpstreamUnavailable');
  });

  it('happy path: timeout markers map to TimeoutError', () => {
    expect(classifyError({ name: 'AbortError' })).toBe('TimeoutError');
    expect(classifyError({ code: 'ETIMEDOUT' })).toBe('TimeoutError');
    expect(classifyError({ message: 'Request timed out' })).toBe('TimeoutError');
  });

  it('happy path: HTTP status codes map to the right bucket', () => {
    expect(classifyError({ status: 401 })).toBe('AuthError');
    expect(classifyError({ status: 403 })).toBe('AuthError');
    expect(classifyError({ status: 429 })).toBe('RateLimitError');
    expect(classifyError({ status: 400 })).toBe('ValidationError');
    expect(classifyError({ status: 422 })).toBe('ValidationError');
    expect(classifyError({ status: 503 })).toBe('UpstreamUnavailable');
  });

  it('boundary: statusCode field (not status) is also read', () => {
    expect(classifyError({ statusCode: 429 })).toBe('RateLimitError');
  });

  it('happy path: message-text fallbacks catch rate-limit and auth phrasing', () => {
    expect(classifyError({ message: 'Rate limit exceeded' })).toBe('RateLimitError');
    expect(classifyError({ message: 'Invalid credentials supplied' })).toBe('AuthError');
  });

  it('failure path: an unrecognized shape falls back to the error name, never the bare string "Error"', () => {
    expect(classifyError({ name: 'RangeError', message: 'oops' })).toBe('RangeError');
  });

  it('boundary: a null/undefined error is UnknownError, not a crash', () => {
    expect(classifyError(null)).toBe('UnknownError');
    expect(classifyError(undefined)).toBe('UnknownError');
  });

  it('boundary: a nameless, codeless, messageless error object never returns the bare string "Error"', () => {
    const result = classifyError({});
    expect(result).toBe('UnknownError');
    expect(result).not.toBe('Error');
  });
});
