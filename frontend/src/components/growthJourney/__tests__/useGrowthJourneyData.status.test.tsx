import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { statusOf, useGrowthJourneyData, type ResponseError } from '../useGrowthJourneyData';

/**
 * The hook carries the HTTP STATUS, not just the message.
 *
 * ─── WHY THIS IS WORTH A SUITE OF ITS OWN ───────────────────────────────────
 *
 * `ScopeState` decides between a CONFIGURATION state and a FAILURE on
 * `status === 403`. If the hook stopped attaching the status, `statusOf` would
 * answer `null` for every error, every 403 would classify as `failed`, and the
 * brand-scoped tabs would render "this request failed" in red on the day this
 * ships - when the real answer is "tenant memberships are not set up yet".
 *
 * Nothing would throw. The page would just be wrong, in red, about a
 * configuration step. So the carrying is pinned here rather than assumed by the
 * component that depends on it.
 *
 * The alternative the status replaced was matching on the message text, which is
 * a guarantee that breaks the first time somebody rewords a server response.
 */

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

/** Reports what the hook put on the error, so the assertions read the real thing. */
function Probe({ fetcher, cacheKey }: { fetcher: () => Promise<unknown>; cacheKey: string }) {
  const state = useGrowthJourneyData(fetcher, cacheKey);
  if (state.loading) return <div>loading</div>;
  if (state.error) {
    return (
      <div>
        <span data-testid="message">{state.error.message}</span>
        <span data-testid="status">{String(statusOf(state.error))}</span>
      </div>
    );
  }
  return <div data-testid="ok">ok</div>;
}

/**
 * Each call needs its OWN key.
 *
 * The hook's effect depends on `[key, nonce]` and holds the fetcher in a ref, by
 * design - that is what removes the `react-hooks/exhaustive-deps` suppression
 * the file's header explains broke `main` for hours. A loop that re-rendered
 * with a new fetcher under the SAME key therefore never re-fetched, and the
 * first draft of the status table below tested a 400 five times while reading as
 * five passes. The assertion caught it; the key is explicit now so it cannot
 * come back.
 */
let keySeq = 0;
async function run(fetcher: () => Promise<unknown>): Promise<void> {
  const cacheKey = `probe-${(keySeq += 1)}`;
  await act(async () => {
    root.render(<Probe fetcher={fetcher} cacheKey={cacheKey} />);
  });
}

const at = (id: string) => container.querySelector(`[data-testid="${id}"]`)?.textContent ?? null;

/** An axios-shaped rejection, which is what the real client produces. */
const axiosError = (status: number, error: string) =>
  Object.assign(new Error('Request failed with status code ' + status), {
    response: { status, data: { error } },
  });

describe('the status survives the hook', () => {
  it('carries a 403 through, alongside the server\'s own message', async () => {
    await run(() => Promise.reject(axiosError(403, 'Brand not in scope')));

    expect(at('status')).toBe('403');
    // The server's message is still preferred over axios's generic one, which is
    // the behaviour that was already here and must not regress.
    expect(at('message')).toBe('Brand not in scope');
  });

  it('distinguishes the statuses this surface actually branches on', async () => {
    for (const code of [400, 403, 404, 409, 500]) {
      await run(() => Promise.reject(axiosError(code, `e${code}`)));
      expect(at('status')).toBe(String(code));
    }
  });

  it('reports null when the request never reached the server', async () => {
    // A network failure, a timeout, a CORS rejection. "We could not ask" is a
    // different fact from a status the server chose, and `ScopeState` treats it
    // as a genuine failure rather than as a configuration step.
    await run(() => Promise.reject(new Error('Network Error')));

    expect(at('status')).toBe('null');
    expect(at('message')).toBe('Network Error');
  });

  it('leaves a successful read alone', async () => {
    await run(() => Promise.resolve({ ok: true }));
    expect(at('ok')).toBe('ok');
  });
});

describe('statusOf', () => {
  it('answers null for no error at all, and for an error that never had one', () => {
    expect(statusOf(null)).toBeNull();
    expect(statusOf(new Error('plain'))).toBeNull();
  });

  it('reads the status when it is there', () => {
    const err: ResponseError = Object.assign(new Error('x'), { status: 403 });
    expect(statusOf(err)).toBe(403);
  });
});
