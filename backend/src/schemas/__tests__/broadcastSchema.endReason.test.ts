import { producerCommandSchema } from '../broadcastSchema';

/**
 * L7.4 — a client must never be able to say WHY a broadcast ended.
 *
 * `end_reason` is an audit field: it distinguishes a producer pressing End from the safety net
 * firing after a sustained stream loss. The moment a caller can set it, it stops being
 * evidence of anything — a staff account could end a class and have the row say the stream
 * dropped, and six months later nobody could tell.
 *
 * The protection is that the command schema is `.strict()` and the controller never reads such
 * a field, so the service's default of 'producer' stands. That is easy to lose in a future
 * edit that relaxes the schema "just to pass something through", which is why it is pinned
 * here rather than left as a property of how the code happens to look today.
 */

const ok = { command: 'end' as const, expected_version: 3 };

describe('the producer command body', () => {
  it('accepts the two fields it is meant to carry', () => {
    // The positive control: without it, every rejection below could be the schema refusing
    // everything.
    expect(producerCommandSchema.safeParse(ok).success).toBe(true);
  });

  it('refuses a client-supplied end_reason', () => {
    expect(producerCommandSchema.safeParse({ ...ok, end_reason: 'auto_stream_gone' }).success).toBe(false);
  });

  it('refuses the camelCase spelling too', () => {
    expect(producerCommandSchema.safeParse({ ...ok, endReason: 'auto_stream_gone' }).success).toBe(false);
  });

  it('refuses a claimed end instant, for the same reason', () => {
    // `ended_at` comes from the server clock. A caller supplying one could date a broadcast's
    // end to any time it liked.
    expect(producerCommandSchema.safeParse({ ...ok, ended_at: '2020-01-01T00:00:00Z' }).success).toBe(false);
  });
});
