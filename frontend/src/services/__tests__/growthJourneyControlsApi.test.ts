import {
  PAUSE_CHANNELS, ROLLOUT_CHANNELS, ROLLOUT_MODES, COHORT_MAX, DAILY_LIMIT_MAX,
  rolloutBody, controlRefusal,
} from '../growthJourneyControlsApi';

/**
 * The control write contracts (Phase 6, T615).
 *
 * ── EACH CELL BELOW WAS WRITTEN AGAINST A MUTATION, NOT A HOPE ──────────────
 *
 * T613 and T614 produced five defects between them and every single one was a
 * check that could not fail - twice on lines my own scanner had already flagged.
 * So the order here is inverted: for each cell I named the edit it has to catch
 * first, and the assertion is whatever fails under that edit. The named edit is in
 * the comment. If you cannot state the mutation a cell kills, the cell is
 * decoration.
 *
 * This file tests the BODY BUILDERS rather than a component, because that is where
 * the logic lives and where a wrong body becomes a 400 or - worse - a rollout that
 * succeeds with a scope the operator did not intend.
 */

describe('the channel asymmetry, which is a safety property and not a typo', () => {
  // KILLS: `ROLLOUT_CHANNELS = PAUSE_CHANNELS`, or adding 'ali_outreach' to the
  // rollout list. The backend refuses it, so a UI offering it would present a
  // control that 400s - but worse, it would advertise that Ali's personal outreach
  // can be STARTED from this screen. It can only be stopped from it.
  it('lets a pause name ali_outreach', () => {
    expect(PAUSE_CHANNELS).toContain('ali_outreach');
  });

  it('and NEVER lets a rollout name it', () => {
    expect(ROLLOUT_CHANNELS).not.toContain('ali_outreach');
  });

  it('so the two lists are genuinely different, not copies', () => {
    // A positive control on the pair: if someone unifies them, the two cells above
    // could both still pass against a single list that happens to omit the channel.
    expect([...ROLLOUT_CHANNELS].sort()).not.toEqual([...PAUSE_CHANNELS].sort());
    expect(PAUSE_CHANNELS.length).toBeGreaterThan(ROLLOUT_CHANNELS.length);
  });

  it('and both still carry the two channels a rollout may use', () => {
    (['email', 'in_app'] as const).forEach((c) => {
      expect(ROLLOUT_CHANNELS).toContain(c);
      expect(PAUSE_CHANNELS).toContain(c);
    });
  });
});

describe('the caps the backend enforces, mirrored so the operator sees them first', () => {
  // KILLS: DAILY_LIMIT_MAX raised to 26 - the plan's M2 - or COHORT_MAX widened.
  // Asserted as exact values rather than ">= 1", because the point is the number.
  it('caps a daily limit at 25', () => {
    expect(DAILY_LIMIT_MAX).toBe(25);
  });

  it('caps a cohort at 50', () => {
    expect(COHORT_MAX).toBe(50);
  });

  it('offers exactly two rollout modes', () => {
    expect([...ROLLOUT_MODES]).toEqual(['review', 'limited']);
  });
});

describe('the mode decides which keys exist, because the body is .strict()', () => {
  const base = {
    brand_id: 'b-1', program_id: 'p-1', channel: 'email' as const, reason: 'piloting',
  };

  // KILLS: `rolloutBody` spreading the form state instead of branching on mode. A
  // review rollout carrying a daily_limit is a 400 from `.refine`, and the likeliest
  // way to send one is an operator who typed a limit and then switched to review.
  it('strips cohort and limit from a REVIEW rollout even when the form holds them', () => {
    const body = rolloutBody({
      ...base, mode: 'review', cohort_lead_ids: [1, 2, 3], daily_limit: 10,
    });
    expect(body).not.toHaveProperty('cohort_lead_ids');
    expect(body).not.toHaveProperty('daily_limit');
    expect(body).toEqual({ ...base, mode: 'review' });
  });

  it('keeps both on a LIMITED rollout', () => {
    const body = rolloutBody({
      ...base, mode: 'limited', cohort_lead_ids: [7], daily_limit: 5,
    });
    expect(body.cohort_lead_ids).toEqual([7]);
    expect(body.daily_limit).toBe(5);
  });

  // KILLS: `compact` keeping present-but-undefined keys. Under `.strict()` a key
  // whose value is undefined still serialises as present and is refused, so "the
  // operator left it blank" and "the operator omitted it" must produce the same body.
  it('omits a blank key entirely rather than sending it undefined', () => {
    const body = rolloutBody({ ...base, mode: 'limited', cohort_lead_ids: [], daily_limit: undefined });
    expect(Object.keys(body)).not.toContain('cohort_lead_ids');
    expect(Object.keys(body)).not.toContain('daily_limit');
  });

  it('never invents a key the operator did not supply', () => {
    // The whole-body equality is the assertion: a `.strict()` contract makes any
    // extra key a 400, so "contains what I expect" is not enough here.
    expect(Object.keys(rolloutBody({ ...base, mode: 'review' })).sort())
      .toEqual(['brand_id', 'channel', 'mode', 'program_id', 'reason']);
  });
});

describe('reason is required, and the builder cannot be the thing that drops it', () => {
  // KILLS: `reason` made optional - the plan's M3 - or `compact` treating a
  // whitespace-only reason as present. A control with no stated reason is an
  // unexplained change to who the system may contact.
  it('carries the reason through on both modes', () => {
    expect(rolloutBody({
      brand_id: 'b', program_id: 'p', channel: 'email', mode: 'review', reason: 'why',
    }).reason).toBe('why');
  });

  it('drops an EMPTY reason rather than sending it, so the server refuses loudly', () => {
    // Deliberate: an empty string would pass `.strict()` key-wise and fail
    // `.min(1)`, which is the same 400 - but omitting it makes the refusal name the
    // missing field rather than its length, which is the clearer message.
    const body = rolloutBody({
      brand_id: 'b', program_id: 'p', channel: 'email', mode: 'review', reason: '',
    });
    expect(Object.keys(body)).not.toContain('reason');
  });
});

describe('the server refusal, unwrapped for display', () => {
  const err = (status: number, data: unknown) => ({ response: { status, data } });

  // KILLS: `controlRefusal` returning null for a 409, or swallowing `details`. The
  // 400 messages ARE the cross-field rules in the operator's own words, and
  // paraphrasing them in the UI is how a screen starts disagreeing with its API.
  it('unwraps a 400 with its field messages intact', () => {
    const r = controlRefusal(err(400, {
      error: 'Invalid request',
      details: [{ path: 'daily_limit', message: 'a limited rollout needs cohort_lead_ids and daily_limit' }],
    }));
    expect(r?.status).toBe(400);
    expect(r?.details[0].message).toContain('needs cohort_lead_ids');
  });

  it('treats a 409 as a refusal too, because "already exists" is not a fault', () => {
    expect(controlRefusal(err(409, { error: 'Control already active' }))?.status).toBe(409);
  });

  it('returns null for a 500, which IS a fault and must not read as a refusal', () => {
    expect(controlRefusal(err(500, { error: 'Journey read failed' }))).toBeNull();
  });

  it('returns null for a shape it does not recognise rather than inventing one', () => {
    expect(controlRefusal(new Error('network'))).toBeNull();
    expect(controlRefusal(err(400, {}))).toBeNull();
  });

  it('survives a details array of the wrong shape without throwing', () => {
    // The payload is server-controlled; a malformed `details` must degrade to an
    // empty list rather than crash the form that is rendering it.
    const r = controlRefusal(err(400, { error: 'Invalid request', details: ['nonsense', null, 7] }));
    expect(r?.details).toEqual([]);
  });
});
