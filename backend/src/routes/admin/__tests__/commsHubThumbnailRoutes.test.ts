jest.mock('jsonwebtoken', () => ({ verify: jest.fn() }));
jest.mock('../../../config/env', () => require('../../../__tests__/testSupport/configMocks').envModuleMock({ jwtSecret: 'test-secret' }));
jest.mock('../../campusRoutes', () => ({ logFailure: jest.fn(), sendValidated: jest.fn() }));
jest.mock('../commsHubEventRoutes', () => ({ actorOf: () => ({ id: 'jackie-1', label: 'jackie' }) }));
jest.mock('../../../services/commsHub/thumbnails/thumbnailStudio', () => {
  const actual = jest.requireActual('../../../services/commsHub/thumbnails/thumbnailStudio');
  return {
    StudioError: actual.StudioError, STUDIO_STYLES: actual.STUDIO_STYLES, THUMB_SIZES: actual.THUMB_SIZES, isTemplate: actual.isTemplate, isFamily: actual.isFamily,
    listOptions: jest.fn(), editableEvent: jest.fn(), buildRequest: jest.fn(), generateBatch: jest.fn(), chooseOption: jest.fn(), optionPng: jest.fn(), uploadOwn: jest.fn(),
  };
});
jest.mock('../../../services/commsHub/thumbnails/thumbnailChange', () => {
  const actual = jest.requireActual('../../../services/commsHub/thumbnails/thumbnailChange');
  return { ChangeNotUnderstoodError: actual.ChangeNotUnderstoodError, planChange: jest.fn() };
});
jest.mock('../../../models/CommsHubThumbnail', () => ({ __esModule: true, default: { findOne: jest.fn() } }));

import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import router from '../commsHubThumbnailRoutes';
import * as studio from '../../../services/commsHub/thumbnails/thumbnailStudio';
import * as change from '../../../services/commsHub/thumbnails/thumbnailChange';
import CommsHubThumbnail from '../../../models/CommsHubThumbnail';
import { PromptGuardError } from '../../../services/commsHub/thumbnails/stylePrompts';
import { resetJobs } from '../../../services/commsHub/thumbnails/thumbnailJobs';

/** CH4.4 studio routes through the real router, guard and multer: access, shapes, status codes, headers. */
const verify = jwt.verify as unknown as jest.Mock;
const EVENT = '88888888-8888-4888-8888-888888888888';
const THUMB = '99999999-9999-4999-8999-999999999999';
const BASE = `/api/admin/comms-hub/events/${EVENT}/thumbnails`;
const JACKIE = { role: 'admin', mgmt_role: 'community_organizer' };
const app = express();
app.use(express.json());
app.use(router);
const as = (who: Record<string, unknown> = JACKIE) => { verify.mockReturnValue(who); return { Authorization: 'Bearer t' }; };
const flush = (): Promise<void> => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks(); resetJobs();
  (studio.editableEvent as jest.Mock).mockResolvedValue({ id: EVENT, title: 'Demo Tuesday' });
  (studio.buildRequest as jest.Mock).mockImplementation(async (_e: unknown, t: Record<string, unknown>) => ({ ...t }));
  (studio.generateBatch as jest.Mock).mockResolvedValue({ optionIds: ['o1'], notice: null });
});

describe('CH4.4 access', () => {
  it('every studio route refuses a staff role without the comms_hub section (403)', async () => {
    const who = { role: 'admin', mgmt_role: 'revenue' };
    const calls = [
      request(app).get(BASE).set(as(who)),
      request(app).post(`${BASE}/generate`).set(as(who)).send({}),
      request(app).post(`${BASE}/upload`).set(as(who)),
      request(app).get(`${BASE}/jobs/${THUMB}`).set(as(who)),
      request(app).post(`${BASE}/${THUMB}/change`).set(as(who)).send({}),
      request(app).post(`${BASE}/${THUMB}/use`).set(as(who)),
      request(app).get(`${BASE}/${THUMB}/download?size=16x9`).set(as(who)),
    ];
    for (const c of calls) expect((await c).status).toBe(403);
    expect(studio.listOptions).not.toHaveBeenCalled();
  });

  it('a community organizer (Jackie) gets through', async () => {
    (studio.listOptions as jest.Mock).mockResolvedValue({ options: [], chosen_id: null, ai: {} });
    expect((await request(app).get(BASE).set(as())).status).toBe(200);
  });
});

describe('CH4.4 generate and poll', () => {
  it('202 with a running job, then the job reports the options', async () => {
    const res = await request(app).post(`${BASE}/generate`).set(as()).send({ style: 'A_dark_tech', headline: 'Demo Tuesday', supporting: 'Live builds.', show_when: true });
    expect(res.status).toBe(202);
    expect(res.body.job).toMatchObject({ status: 'running', event_id: EVENT });
    expect(studio.generateBatch).toHaveBeenCalledWith(expect.objectContaining({ headline: 'Demo Tuesday', showWhen: true }), 'A_dark_tech');
    await flush();
    const poll = await request(app).get(`${BASE}/jobs/${res.body.job.id}`).set(as());
    expect(poll.body.job).toMatchObject({ status: 'done', option_ids: ['o1'] });
  });

  it('a second AI click while one runs: 409, and no second paid batch', async () => {
    (studio.generateBatch as jest.Mock).mockReturnValue(new Promise(() => undefined));
    const body = { style: 'A_dark_tech', headline: 'Demo', show_when: false };
    expect((await request(app).post(`${BASE}/generate`).set(as()).send(body)).status).toBe(202);
    const again = await request(app).post(`${BASE}/generate`).set(as()).send(body);
    expect(again.status).toBe(409);
    expect(studio.generateBatch).toHaveBeenCalledTimes(1);
    // ...but the template fallback is allowed beside it.
    expect((await request(app).post(`${BASE}/generate`).set(as()).send({ ...body, style: 'templates' })).status).toBe(202);
  });

  it('bad input: 400 with the reason (unknown style, no headline, a guarded word)', async () => {
    expect((await request(app).post(`${BASE}/generate`).set(as()).send({ style: 'neon', headline: 'x', show_when: true })).status).toBe(400);
    const empty = await request(app).post(`${BASE}/generate`).set(as()).send({ style: 'templates', headline: ' ', show_when: true });
    expect(empty.body.error).toBe('Add a headline.');
    (studio.buildRequest as jest.Mock).mockRejectedValueOnce(new PromptGuardError('The text "FREE class" contains a word the TWC rules do not allow on Colaberry promotions.'));
    const guarded = await request(app).post(`${BASE}/generate`).set(as()).send({ style: 'templates', headline: 'FREE class', show_when: true });
    expect([guarded.status, guarded.body.error]).toEqual([400, 'The text "FREE class" contains a word the TWC rules do not allow on Colaberry promotions.']);
  });

  it('a cancelled event: the service\'s 409 is passed on', async () => {
    (studio.editableEvent as jest.Mock).mockRejectedValue(new studio.StudioError('This event is cancelled, so its thumbnail cannot change.', 409));
    const res = await request(app).post(`${BASE}/generate`).set(as()).send({ style: 'templates', headline: 'Demo', show_when: true });
    expect([res.status, res.body.error]).toEqual([409, 'This event is cancelled, so its thumbnail cannot change.']);
  });

  it('an unknown job: 404 with a sentence', async () => {
    const res = await request(app).get(`${BASE}/jobs/${THUMB}`).set(as());
    expect(res.status).toBe(404);
  });
});

describe('CH4.4 ask for a change', () => {
  const row = (o: Record<string, unknown> = {}) => ({ id: THUMB, event_id: EVENT, source: 'template', style_family: 'bold_cherry', asset_16x9_id: 'a', inputs: { headline: 'Demo Tuesday', supporting: null, badge: 'TUE' }, ...o });

  it('maps the words, then generates ONE option in the planned style with the planned text', async () => {
    (CommsHubThumbnail.findOne as jest.Mock).mockResolvedValue(row());
    (change.planChange as jest.Mock).mockResolvedValue({ style: 'clean_white', headline: 'Demo Day', supporting: null, showWhen: true, artNote: null, summary: 'White template, shorter headline.' });
    const res = await request(app).post(`${BASE}/${THUMB}/change`).set(as()).send({ request: 'white, shorter headline' });
    expect(res.status).toBe(202);
    expect(res.body.summary).toBe('White template, shorter headline.');
    expect(change.planChange).toHaveBeenCalledWith({ source: 'template', style: 'bold_cherry', headline: 'Demo Tuesday', supporting: null, showWhen: true }, 'white, shorter headline');
    expect(studio.generateBatch).toHaveBeenCalledWith(expect.objectContaining({ headline: 'Demo Day' }), 'clean_white', 1);
  });

  it('not understood: 422 with the plain explanation, nothing generated', async () => {
    (CommsHubThumbnail.findOne as jest.Mock).mockResolvedValue(row());
    (change.planChange as jest.Mock).mockRejectedValue(new change.ChangeNotUnderstoodError('I could not turn that into a change to this picture.'));
    const res = await request(app).post(`${BASE}/${THUMB}/change`).set(as()).send({ request: 'move the logo up' });
    expect([res.status, res.body.error]).toEqual([422, 'I could not turn that into a change to this picture.']);
    expect(studio.generateBatch).not.toHaveBeenCalled();
  });

  it('an upload cannot be changed (409); an unknown or unfinished option is 404', async () => {
    (CommsHubThumbnail.findOne as jest.Mock).mockResolvedValueOnce(row({ source: 'upload', style_family: 'upload' }));
    expect((await request(app).post(`${BASE}/${THUMB}/change`).set(as()).send({ request: 'brighter' })).status).toBe(409);
    (CommsHubThumbnail.findOne as jest.Mock).mockResolvedValueOnce(row({ asset_16x9_id: null }));
    expect((await request(app).post(`${BASE}/${THUMB}/change`).set(as()).send({ request: 'brighter' })).status).toBe(404);
    (CommsHubThumbnail.findOne as jest.Mock).mockResolvedValueOnce(null);
    expect((await request(app).post(`${BASE}/${THUMB}/change`).set(as()).send({ request: 'brighter' })).status).toBe(404);
    expect(change.planChange).not.toHaveBeenCalled();
  });
});

describe('CH4.4 use, download, upload', () => {
  it('use: the chosen id comes back', async () => {
    (studio.chooseOption as jest.Mock).mockResolvedValue({ thumbnail_id: THUMB });
    const res = await request(app).post(`${BASE}/${THUMB}/use`).set(as());
    expect([res.status, res.body]).toEqual([200, { thumbnail_id: THUMB }]);
    expect(studio.chooseOption).toHaveBeenCalledWith(EVENT, THUMB, { id: 'jackie-1', label: 'jackie' });
  });

  it('download: the PNG of the chosen size as an attachment; a bad size is 400', async () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    (studio.optionPng as jest.Mock).mockResolvedValue(png);
    const res = await request(app).get(`${BASE}/${THUMB}/download?size=1x1`).set(as()).buffer(true).parse((r, cb) => { const c: Buffer[] = []; r.on('data', (d: Buffer) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toBe('attachment; filename="thumbnail-1x1.png"');
    expect((res.body as Buffer).equals(png)).toBe(true);
    expect(studio.optionPng).toHaveBeenCalledWith(EVENT, THUMB, '1x1');
    expect((await request(app).get(`${BASE}/${THUMB}/download?size=4x3`).set(as())).status).toBe(400);
  });

  it('upload: 201 with the new option; alt text and a file are required', async () => {
    (studio.uploadOwn as jest.Mock).mockResolvedValue('u1');
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
    const ok = await request(app).post(`${BASE}/upload`).set(as()).field('alt_text', 'Our team at the whiteboard').attach('file', jpg, 'team.jpg');
    expect([ok.status, ok.body]).toEqual([201, { id: 'u1' }]);
    expect((studio.uploadOwn as jest.Mock).mock.calls[0][1]).toMatchObject({ altText: 'Our team at the whiteboard' });
    expect((await request(app).post(`${BASE}/upload`).set(as()).field('alt_text', 'x').attach('file', jpg, 'a.jpg')).status).toBe(400);
    expect((await request(app).post(`${BASE}/upload`).set(as()).field('alt_text', 'Our team')).status).toBe(400);
  });
});
