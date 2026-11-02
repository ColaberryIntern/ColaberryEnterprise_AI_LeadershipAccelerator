/**
 * The rundown's HTTP edge.
 *
 * The pairing arithmetic is pinned in `broadcastRundown.test.ts`; what is left here is what
 * silently regresses at a route boundary — who may read it, what it refuses to invent from a
 * JSONB column, and whether a wire shape stays snake_case when it is mapped by hand.
 *
 * `sessionLiveStateService` is required LAZILY inside the handler, so the mock below has to be
 * in place before the handler runs rather than before the module loads. That laziness is not an
 * accident on either side: the kit builder reaches the Sequelize models, and importing them at
 * module load pulls a live connection into every consumer.
 */
jest.mock('../../services/sessionLiveStateService', () => ({
  slidesForSession: jest.fn(),
  getBroadcast: jest.fn(),
}));

import type { Request, Response } from 'express';
import { getSessionRundown } from '../broadcastRundownController';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const live = require('../../services/sessionLiveStateService');

const SID = '11111111-2222-4333-8444-555555555555';

const slide = (segmentId: string, label: string, start: number, end: number, title: string) => ({
  segmentId, segmentLabel: label, segStartMin: start, segEndMin: end, title,
});

const SLIDES = [
  slide('result-preview', 'Result preview', 0, 5, 'What you are building'),
  slide('build-map', 'Build map', 5, 25, 'Checkpoints'),
  slide('build-map', 'Build map', 5, 25, 'Safety rules'),
];

function reqRes(staff: boolean, params: Record<string, string> = { id: SID }) {
  const req = {
    params: { sessionId: params.id ?? SID },
    participant: staff ? { isStaff: true } : { isStaff: false },
  } as unknown as Request;
  const body: { status: number; json: unknown } = { status: 200, json: null };
  const res = {
    status(code: number) { body.status = code; return res; },
    json(payload: unknown) { body.json = payload; return res; },
  } as unknown as Response;
  return { req, res, body };
}

beforeEach(() => {
  jest.clearAllMocks();
  live.slidesForSession.mockResolvedValue(SLIDES);
  live.getBroadcast.mockResolvedValue({ slide_index: 2, title: 'Safety rules' });
});

describe('who may read it', () => {
  it('403s a viewer who is not a producer, WITHOUT reading anything first', async () => {
    /**
     * The refusal precedes the read on purpose: a rundown names the segments and their planned
     * windows, which is presenter material, and answering differently for a session that exists
     * would tell a non-producer that it does.
     */
    const { req, res, body } = reqRes(false);
    await getSessionRundown(req, res);
    expect(body.status).toBe(403);
    expect(body.json).toEqual({ error: 'Forbidden', reason: 'not_a_producer' });
    expect(live.slidesForSession).not.toHaveBeenCalled();
    expect(live.getBroadcast).not.toHaveBeenCalled();
  });

  it('400s a malformed session id rather than reporting it as an internal fault', async () => {
    // A ZodError carries no `status`, so without an explicit branch this would be a 500 — and
    // logged as one, which puts a caller's typo into the error stream.
    const { req, res, body } = reqRes(true, { id: 'not-a-uuid' });
    await getSessionRundown(req, res);
    expect(body.status).toBe(400);
    expect(body.json).toMatchObject({ error: 'Validation failed' });
  });
});

describe('the wire shape', () => {
  it('maps the rundown to snake_case, which is what every other broadcast route sends', async () => {
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.status).toBe(200);
    expect(body.json).toEqual({
      planned: true,
      total_minutes: 25,
      slide_count: 3,
      position_state: 'on_segment',
      current_segment_id: 'build-map',
      current_slide_index: 2,
      current_slide_title: 'Safety rules',
      deck_claimed_title: null,
      segments: [
        {
          id: 'result-preview', label: 'Result preview', planned_start_min: 0, planned_end_min: 5,
          first_slide: 0, last_slide: 0, slide_count: 1, standing: 'done',
        },
        {
          id: 'build-map', label: 'Build map', planned_start_min: 5, planned_end_min: 25,
          first_slide: 1, last_slide: 2, slide_count: 2, standing: 'current',
        },
      ],
    });
  });

  it('DOES NOT SEND THE CLASS CLOCK, so there is only ever one copy of it', async () => {
    /**
     * `content_started_at` is already on the producer read, which the same page already polls,
     * and the strip's clock is computed from it. A second copy here could disagree across a
     * slow poll — and the one thing a pace verdict must not do is measure against a different
     * start than the clock beside it.
     */
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    const keys = Object.keys(body.json as Record<string, unknown>);
    expect(keys).not.toContain('content_started_at');
    expect(keys).not.toContain('ended_at');
    expect(keys).not.toContain('scheduled_start_at');
  });

  it('says a session has no plan rather than sending an empty one', async () => {
    // A session with no week blueprint has nothing to build a run of show from. An empty
    // segment list would read as a show with no segments, which is a different statement.
    live.slidesForSession.mockResolvedValue(null);
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.status).toBe(200);
    expect(body.json).toEqual({ planned: false, segments: [] });
  });
});

describe('what it refuses to believe from the broadcast row', () => {
  it('reports no position for a class that has never been presented', async () => {
    live.getBroadcast.mockResolvedValue(null);
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.json).toMatchObject({ position_state: 'no_position', current_segment_id: null });
  });

  it('SEPARATES a bad slide_index from an absent one, rather than reporting both as absent', async () => {
    /**
     * The distinction this route exists to keep. `slide_index: "2"` is a contract violation — a
     * JSONB column holding something the deck never writes — and it must not read as "nobody
     * has presented this class", which is the reassuring answer and the wrong one. Narrowing
     * the value in the controller used to produce exactly that, which is why the raw value is
     * now handed to `buildRundown` and narrowed once, there.
     */
    live.getBroadcast.mockResolvedValue({ slide_index: '2', title: 'Safety rules' });
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.json).toMatchObject({ position_state: 'unresolvable', current_slide_index: null });

    // ...while a session no deck has ever written to is the ordinary case, and says so.
    live.getBroadcast.mockResolvedValue(null);
    const absent = reqRes(true);
    await getSessionRundown(absent.req, absent.res);
    expect(absent.body.json).toMatchObject({ position_state: 'no_position' });
  });

  it('keeps an out-of-range NUMBER, because that number is the diagnosis', async () => {
    // "Slide 40, and this plan has 3" is what tells a producer the deck is on a longer list
    // than the server — a reading a non-numeric value cannot give.
    live.getBroadcast.mockResolvedValue({ slide_index: 40, title: 'Safety rules' });
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.json).toMatchObject({ position_state: 'unresolvable', current_slide_index: 40 });
  });

  it('treats a missing deck title as an older deck rather than as drift', async () => {
    live.getBroadcast.mockResolvedValue({ slide_index: 2 });
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.json).toMatchObject({
      position_state: 'on_segment', current_segment_id: 'build-map',
    });
  });

  it('reports drift, with both titles, when the deck is on another slide list', async () => {
    live.getBroadcast.mockResolvedValue({ slide_index: 2, title: 'A slide that moved' });
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.json).toMatchObject({
      position_state: 'deck_drifted',
      current_segment_id: null,
      current_slide_title: 'Safety rules',
      deck_claimed_title: 'A slide that moved',
    });
  });
});

describe('when a read fails', () => {
  it('500s WITHOUT echoing the error message, which can carry a connection string', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    live.slidesForSession.mockRejectedValue(
      new Error('connect ECONNREFUSED postgres://user:secret@db:5432'),
    );
    const { req, res, body } = reqRes(true);
    await getSessionRundown(req, res);
    expect(body.status).toBe(500);
    expect(body.json).toEqual({ error: 'Internal error' });
    expect(JSON.stringify(body.json)).not.toContain('secret');
    // Logged for triage, and the logged line carries the class and not the message either.
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).not.toContain('secret');
    spy.mockRestore();
  });
});
