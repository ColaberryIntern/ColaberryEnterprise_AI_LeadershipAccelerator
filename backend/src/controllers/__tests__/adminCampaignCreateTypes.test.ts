import type { Request, Response } from 'express';
import { handleCreateCampaign } from '../adminCampaignController';
import {
  CAMPAIGN_TYPES,
  EMAIL_LIFECYCLE_CAMPAIGN_TYPES,
  MARKETING_CAMPAIGN_TYPES,
} from '../../models/Campaign';

/**
 * A marketing campaign can be created at all.
 *
 * It could not be, until 2026-10-08. `handleCreateCampaign` validated `type` against a literal
 * list of the eight EMAIL lifecycle types, so every campaign the API could produce was one the
 * composer's picker then correctly filtered out as "not something a post can go out under".
 * The picker was therefore empty with no way on earth to fill it, which is how Ali found it:
 * "now I have no way to create Landing page campaign".
 *
 * NO DATABASE IS TOUCHED. The handler checks the type BEFORE it checks admin authentication, so
 * a request with no admin returns 401 once the type was accepted and 400 when it was not. That
 * difference is the whole assertion, and it needs no model, no connection and no fixtures.
 */

function reqWith(body: Record<string, unknown>): Request {
  return { body } as unknown as Request;
}

function spyRes(): { res: Response; status: number | null; payload: Record<string, unknown> | null } {
  const out: { res: Response; status: number | null; payload: Record<string, unknown> | null } = {
    res: null as unknown as Response, status: null, payload: null,
  };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(body: Record<string, unknown>) { out.payload = body; return this; },
  } as unknown as Response;
  out.res = res;
  return out;
}

const next = (() => undefined) as unknown as Parameters<typeof handleCreateCampaign>[2];

describe('the create route admits marketing campaigns', () => {
  it.each(MARKETING_CAMPAIGN_TYPES)('accepts %s as a campaign type', async (type) => {
    const r = spyRes();
    await handleCreateCampaign(reqWith({ name: 'October class', type }), r.res, next);
    // Past the type gate. 401 is the NEXT check (no admin on this bare request), which is the
    // proof: a rejected type would have stopped at 400 before ever reaching it.
    expect(r.status).toBe(401);
    expect(r.payload).not.toEqual({ error: 'Invalid campaign type' });
  });

  it('still admits the email lifecycle types it always did', async () => {
    for (const type of EMAIL_LIFECYCLE_CAMPAIGN_TYPES) {
      const r = spyRes();
      await handleCreateCampaign(reqWith({ name: 'Nurture', type }), r.res, next);
      expect(r.status).toBe(401);
    }
  });

  it('still refuses a type that is neither', async () => {
    const r = spyRes();
    await handleCreateCampaign(reqWith({ name: 'Whatever', type: 'not_a_real_type' }), r.res, next);
    expect(r.status).toBe(400);
    expect(r.payload).toEqual({ error: 'Invalid campaign type' });
  });

  it('still requires a name and a type', async () => {
    const r = spyRes();
    await handleCreateCampaign(reqWith({ type: 'marketing' }), r.res, next);
    expect(r.status).toBe(400);
    expect(r.payload).toEqual({ error: 'name and type are required' });
  });
});

describe('the two kinds stay distinct and storable', () => {
  it('keeps marketing and email lifecycle types disjoint', () => {
    // The composer's split depends on these not overlapping: a type in both lists would be
    // offered for a social post AND driven as an email sequence.
    const overlap = MARKETING_CAMPAIGN_TYPES.filter((t) => (EMAIL_LIFECYCLE_CAMPAIGN_TYPES as readonly string[]).includes(t));
    expect(overlap).toEqual([]);
  });

  it('fits the column, which is STRING(30) and not an enum', () => {
    // Why no migration was needed - and why a longer name later would silently truncate.
    CAMPAIGN_TYPES.forEach((t) => expect(t.length).toBeLessThanOrEqual(30));
  });

  it('carries every type into the union the validation reads', () => {
    expect(CAMPAIGN_TYPES).toEqual([...EMAIL_LIFECYCLE_CAMPAIGN_TYPES, ...MARKETING_CAMPAIGN_TYPES]);
  });
});
