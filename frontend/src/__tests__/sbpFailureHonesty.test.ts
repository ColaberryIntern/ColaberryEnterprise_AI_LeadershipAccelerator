/**
 * A refused request and an unreachable server are different failures.
 *
 * The Projects page had one fallback banner for every non-gate failure, and it
 * said: "We could not reach the requirements service ... It is worth starting
 * the build again once you are back online." Taiwo Oludimimu was shown that
 * after a 400 `Invalid input` — the server was reached and had REFUSED his
 * payload. Going back online was the one action that could not possibly help,
 * and it was the only action we gave him.
 *
 * The server already sends the Zod `issues` array naming the offending field.
 * The client discarded it and printed the generic word "Invalid input".
 *
 * These tests pin the distinction and the salvage of `issues`.
 */
import { classifyError, describeFailure } from '../services/sbpFailure';

/** An axios-shaped rejection, since that is what the client actually catches. */
const axiosErr = (status: number | null, data?: any, message = 'Request failed') =>
  (status === null ? { message, request: {} } : { response: { status, data }, message });

describe('classifyError separates refusal from unreachability', () => {
  it('classifies a 400 as rejected, not unreachable', () => {
    const e = classifyError(axiosErr(400, { error: 'Invalid input', issues: [] }));

    expect(e.kind).toBe('rejected');
  });

  it('classifies a transport failure with no response as unreachable', () => {
    const e = classifyError(axiosErr(null, undefined, 'Network Error'));

    expect(e.kind).toBe('unreachable');
  });

  it('classifies a 500 as a server fault rather than unreachable', () => {
    const e = classifyError(axiosErr(500, {}));

    expect(e.kind).toBe('server_error');
  });

  it('keeps the pipeline-disabled 404 distinct from a refusal', () => {
    const e = classifyError(axiosErr(404, {}));

    expect(e.kind).toBe('not_enabled');
  });
});

describe('classifyError names the field the server rejected', () => {
  const longAnswerRejection = axiosErr(400, {
    error: 'Invalid input',
    issues: [
      { code: 'too_big', path: ['users'], message: 'String must contain at most 2000 character(s)' },
    ],
  });

  it('salvages the rejected field path from the issues array', () => {
    const e = classifyError(longAnswerRejection);

    expect(e.fields).toEqual(['users']);
  });

  it('does not present the bare word "Invalid input" to the student', () => {
    const e = classifyError(longAnswerRejection);

    expect(e.message).not.toBe('Invalid input');
  });

  it('explains a too-long interview answer in terms of what the student typed', () => {
    const e = classifyError(longAnswerRejection);

    expect(e.message).toMatch(/answer/i);
  });
});

describe('describeFailure never sends a rejected student to check their connection', () => {
  it('does not tell a 400 to come back once they are online', () => {
    // "back online" lived in the ACTION line, which is the sentence a student
    // acts on. Asserting against the body alone would have passed on the
    // original code while the harmful instruction survived untouched.
    const copy = describeFailure(classifyError(axiosErr(400, { error: 'Invalid input', issues: [] })));

    expect(copy.action).not.toMatch(/back online/i);
  });

  it('does not blame the network for a request the server answered', () => {
    const copy = describeFailure(classifyError(axiosErr(400, { error: 'Invalid input', issues: [] })));

    expect(copy.body).not.toMatch(/could not reach/i);
  });

  it('gives a rejected student an action they can actually take', () => {
    const copy = describeFailure(classifyError(axiosErr(400, {
      error: 'Invalid input',
      issues: [{ code: 'too_big', path: ['users'], message: 'too long' }],
    })));

    expect(copy.action).toMatch(/shorten/i);
  });

  it('still says the service was unreachable when it genuinely was', () => {
    const copy = describeFailure(classifyError(axiosErr(null, undefined, 'Network Error')));

    expect(copy.body).toMatch(/could not reach/i);
  });
});
