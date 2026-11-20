/** CH4.4 the studio's server side: batches, the options list, choosing, the public picture, uploads. */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp');

type Row = Record<string, any>;
const events = new Map<string, Row>();
let thumbs: Row[] = [];
const activity: Row[] = [];
const stored: Row[] = [];

jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: { findByPk: jest.fn(async (id: string) => events.get(id) ?? null) } }));
jest.mock('../../../../models/CommsHubEventPhoto', () => ({ __esModule: true, default: { findAll: jest.fn(async () => []) } }));
jest.mock('../../../../models/CommsHubThumbnail', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async () => thumbs.filter((t) => t.asset_16x9_id)),
    findOne: jest.fn(async ({ where }: Row) => thumbs.find((t) => t.id === where.id && t.event_id === where.event_id) ?? null),
    count: jest.fn(async () => 2),
  },
}));
jest.mock('../../../../models/MediaAsset', () => ({
  __esModule: true,
  default: {
    findAll: jest.fn(async ({ where }: Row) => (where.id as string[]).map((id) => ({ id, storage_key: `media/k/${id}.png` }))),
    findByPk: jest.fn(async (id: string) => ({ id, storage_key: `media/k/${id}.png` })),
  },
}));
jest.mock('../../../media/mediaAssetService', () => ({}));
jest.mock('../../../../models/Brand', () => ({ __esModule: true, default: {} }));
jest.mock('../../../media/mediaStore', () => ({ read: jest.fn(async (k: string) => Buffer.from(`bytes:${k}`)), signedUrl: (k: string, b: string) => ({ url: `${b}/${k}?sig` }) }));
jest.mock('../../../publishing/adapterRegistry', () => ({ mediaPublicBaseUrl: () => 'https://x' }));
jest.mock('../../activityLog', () => ({ logActivity: jest.fn(async (_a: Row, action: string, _t: string, id: string, detail: Row) => { activity.push({ action, id, ...detail }); }) }));
jest.mock('../thumbnailStore', () => ({
  centralMidnight: () => new Date('2026-11-20T06:00:00Z'),
  storeOption: jest.fn(async (o: Row) => { stored.push(o); return { id: `up${stored.length}` }; }),
}));
const mockAiAttempt = jest.fn();
const mockTemplates = jest.fn(async (_req: unknown, only?: string[]) => (only ?? ['bold_cherry', 'berry_night', 'clean_white']).map((s) => ({ id: `tpl-${s}`, source: 'template', style: s })));
jest.mock('../thumbnailSources', () => ({
  ...jest.requireActual('../thumbnailSources'),
  aiAttempt: (...a: unknown[]) => mockAiAttempt(...a),
  templateOptions: (...a: unknown[]) => mockTemplates(...(a as [unknown, string[] | undefined])),
}));

import { Op } from 'sequelize';
import CommsHubThumbnail from '../../../../models/CommsHubThumbnail';
import { buildRequest, chooseOption, generateBatch, listOptions, publicThumbnail, uploadOwn, StudioError } from '../thumbnailStudio';
import { PromptGuardError } from '../stylePrompts';
import type { GenerateRequest } from '../thumbnailSources';

const JACKIE = { id: 'jackie-1', label: 'j' };
const ev = (o: Row = {}): Row => {
  const e: Row = { id: 'e1', title: 'Demo Tuesday', status: 'scheduled', starts_at: new Date('2026-12-02T00:00:00Z'), repeat_rule: null, hosts: [], join_url: null, thumbnail_id: null, placement: { calendar: true, events_page: true, campus_rail: true }, ...o };
  e.update = jest.fn(async (patch: Row) => Object.assign(e, patch));
  return e;
};
const done = (id: string, o: Row = {}): Row => ({ id, event_id: 'e1', source: 'template', style_family: 'bold_cherry', prompt_used: null, inputs: { headline: 'Demo Tuesday', supporting: null, badge: 'X' }, asset_16x9_id: `${id}-w`, asset_1x1_id: `${id}-s`, asset_3x1_id: `${id}-b`, cost_usd: '0.0000', created_at: new Date('2026-11-20T15:00:00Z'), ...o });
const req = (): GenerateRequest => ({ event: ev() as never, headline: 'Demo Tuesday', supporting: null, showWhen: true, photos: [], actor: JACKIE });

beforeEach(() => { events.clear(); thumbs = []; activity.length = 0; stored.length = 0; jest.clearAllMocks(); events.set('e1', ev()); });

describe('CH4.4 generateBatch', () => {
  it('"templates" makes the three branded templates; one template id makes just that one', async () => {
    expect((await generateBatch(req(), 'templates')).optionIds).toEqual(['tpl-bold_cherry', 'tpl-berry_night', 'tpl-clean_white']);
    expect((await generateBatch(req(), 'clean_white')).optionIds).toEqual(['tpl-clean_white']);
    expect(mockAiAttempt).not.toHaveBeenCalled();
  });

  it('an AI style makes 3 attempts at once and offers what came back', async () => {
    mockAiAttempt.mockImplementation(async () => ({ option: { id: `ai${mockAiAttempt.mock.calls.length}` }, reason: null }));
    const r = await generateBatch(req(), 'A_dark_tech');
    expect(mockAiAttempt).toHaveBeenCalledTimes(3);
    expect(r).toEqual({ optionIds: ['ai1', 'ai2', 'ai3'], notice: null });
    expect(mockTemplates).not.toHaveBeenCalled();
  });

  it('some fail: the ones made are offered and the notice says how many and why', async () => {
    let n = 0;
    mockAiAttempt.mockImplementation(async () => { n += 1; return n === 2 ? { option: null, reason: 'The image service timed out.' } : { option: { id: `ai${n}` }, reason: null }; });
    const r = await generateBatch(req(), 'A_dark_tech');
    expect(r.optionIds).toEqual(['ai1', 'ai3']);
    expect(r.notice).toBe('2 of 3 AI pictures were made. The image service timed out.');
  });

  it('none made (e.g. the daily ceiling): the templates, ONCE, with the reason', async () => {
    mockAiAttempt.mockResolvedValue({ option: null, reason: "This event has used today's 12 AI pictures." });
    const r = await generateBatch(req(), 'C_open_house');
    expect(mockTemplates).toHaveBeenCalledTimes(1);
    expect(r.optionIds).toHaveLength(3);
    expect(r.notice).toContain("today's 12 AI pictures");
  });

  it('one attempt throwing unexpectedly does not hide the others; all throwing fails the job', async () => {
    let n = 0;
    mockAiAttempt.mockImplementation(async () => { n += 1; if (n === 3) throw new Error('db down'); return { option: { id: `ai${n}` }, reason: null }; });
    const r = await generateBatch(req(), 'A_dark_tech');
    expect(r.optionIds).toEqual(['ai1', 'ai2']);
    expect(r.notice).toBe('2 of 3 AI pictures were made. One AI picture failed unexpectedly.');
    mockAiAttempt.mockRejectedValue(new Error('db down'));
    await expect(generateBatch(req(), 'A_dark_tech')).rejects.toThrow('db down');
  });

  it('a change makes exactly one attempt', async () => {
    mockAiAttempt.mockResolvedValue({ option: { id: 'ai1' }, reason: null });
    await generateBatch(req(), 'E_infographic', 1);
    expect(mockAiAttempt).toHaveBeenCalledTimes(1);
  });
});

describe('CH4.4 buildRequest guards template text too', () => {
  it('refuses a pricing word, a link or a price before anything is generated', async () => {
    for (const headline of ['FREE workshop', 'Join at colaberry.com', 'Only $5']) {
      await expect(buildRequest(ev() as never, { headline, supporting: null, showWhen: true }, JACKIE)).rejects.toBeInstanceOf(PromptGuardError);
    }
    await expect(buildRequest(ev() as never, { headline: 'Demo', supporting: null, showWhen: true, artNote: 'add a QR code' }, JACKIE)).rejects.toBeInstanceOf(PromptGuardError);
    await expect(buildRequest(ev() as never, { headline: 'Demo Tuesday', supporting: 'Live builds.', showWhen: true }, JACKIE)).resolves.toMatchObject({ headline: 'Demo Tuesday', photos: [] });
  });
});

describe('CH4.4 listOptions', () => {
  it('asks only for finished options (a 16:9 picture exists), newest first, and gives a preview of every size', async () => {
    thumbs = [done('t1'), { id: 'pending', event_id: 'e1', source: 'ai', asset_16x9_id: null, inputs: { status: 'pending' } }];
    events.set('e1', ev({ thumbnail_id: 't1' }));
    const view = await listOptions('e1');
    const where = (CommsHubThumbnail.findAll as jest.Mock).mock.calls[0][0].where;
    expect(where.asset_16x9_id[Op.ne]).toBeNull();
    expect(view.options.map((o) => o.id)).toEqual(['t1']);
    expect(view.options[0]).toMatchObject({ style_label: 'Bold cherry', chosen: true, show_when: true, cost_usd: 0 });
    expect(view.options[0].previews).toEqual({ '16x9': 'https://x/media/k/t1-w.png?sig', '1x1': 'https://x/media/k/t1-s.png?sig', '3x1': 'https://x/media/k/t1-b.png?sig' });
    expect(view.ai).toMatchObject({ used_today: 2, daily_limit: 12, batch: 3 });
  });

  it('marks cropped sizes so the studio can say so', async () => {
    thumbs = [done('u1', { source: 'upload', style_family: 'upload', inputs: { cropped: ['16x9', '1x1', '3x1', 'bogus'] } })];
    expect((await listOptions('e1')).options[0]).toMatchObject({ style_label: 'Your upload', cropped: ['16x9', '1x1', '3x1'] });
  });

  it('unknown event: 404', async () => {
    await expect(listOptions('nope')).rejects.toMatchObject({ status: 404 });
  });
});

describe('CH4.4 chooseOption', () => {
  it('sets the event thumbnail and records who chose it', async () => {
    thumbs = [done('t1')];
    const e = await chooseOption('e1', 't1', JACKIE);
    expect(e.thumbnail_id).toBe('t1');
    expect(activity).toEqual([expect.objectContaining({ action: 'thumbnail.chosen', id: 't1', event_id: 'e1', previous: null })]);
  });

  it('refuses another event\'s option and an unfinished attempt (404), and a cancelled event (409)', async () => {
    thumbs = [done('t9', { event_id: 'other' }), { id: 'p1', event_id: 'e1', asset_16x9_id: null }];
    await expect(chooseOption('e1', 't9', JACKIE)).rejects.toMatchObject({ status: 404 });
    await expect(chooseOption('e1', 'p1', JACKIE)).rejects.toMatchObject({ status: 404 });
    events.set('e1', ev({ status: 'cancelled' }));
    await expect(chooseOption('e1', 't9', JACKIE)).rejects.toMatchObject({ status: 409 });
    expect(activity).toEqual([]);
  });
});

describe('CH4.4 publicThumbnail serves only the chosen picture of a published event', () => {
  beforeEach(() => { thumbs = [done('t1')]; });
  it.each([
    ['scheduled, on the Events page, chosen', { thumbnail_id: 't1' }, true],
    ['live', { thumbnail_id: 't1', status: 'live' }, true],
    ['nothing chosen', {}, false],
    ['a draft', { thumbnail_id: 't1', status: 'draft' }, false],
    ['cancelled', { thumbnail_id: 't1', status: 'cancelled' }, false],
    ['not on the Events page', { thumbnail_id: 't1', placement: { calendar: true, events_page: false, campus_rail: true } }, false],
  ])('%s', async (_name, o, served) => {
    events.set('e1', ev(o));
    const png = await publicThumbnail('e1', '1x1');
    if (served) expect(png!.toString()).toBe('bytes:media/k/t1-s.png'); else expect(png).toBeNull();
  });

  it('a chosen id that is not a finished option of this event gives null, not an error', async () => {
    events.set('e1', ev({ thumbnail_id: 'gone' }));
    expect(await publicThumbnail('e1', '16x9')).toBeNull();
  });
});

describe('CH4.4 uploadOwn', () => {
  it('a real JPEG becomes an upload option with all three sizes, each at its exact dimensions', async () => {
    const jpeg: Buffer = await sharp({ create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 30, b: 40 } } }).jpeg().toBuffer();
    expect(await uploadOwn('e1', { bytes: jpeg, altText: 'Our team at the whiteboard' }, JACKIE)).toBe('up1');
    const o = stored[0];
    expect(o).toMatchObject({ source: 'upload', styleFamily: 'upload', altText: 'Our team at the whiteboard', costUsd: 0 });
    for (const [size, [w, h]] of Object.entries({ '16x9': [1600, 900], '1x1': [1080, 1080], '3x1': [1500, 500] })) {
      const meta = await sharp(o.pngs[size]).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(['png', w, h]);
    }
    expect(activity[0]).toMatchObject({ action: 'thumbnail.uploaded', event_id: 'e1' });
  }, 30_000);

  it('not a picture: 415 and nothing stored; a cancelled event: 409', async () => {
    await expect(uploadOwn('e1', { bytes: Buffer.from('%PDF-1.4'), altText: 'x y z' }, JACKIE)).rejects.toMatchObject({ status: 415 });
    events.set('e1', ev({ status: 'cancelled' }));
    await expect(uploadOwn('e1', { bytes: Buffer.from('x'), altText: 'x y z' }, JACKIE)).rejects.toBeInstanceOf(StudioError);
    expect(stored).toEqual([]);
  });
});
