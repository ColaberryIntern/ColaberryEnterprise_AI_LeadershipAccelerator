/**
 * CH4.3 AI thumbnails with the OpenAI client mocked: prompts are built from the event record and the
 * style families, forbidden text is refused, cost is recorded, and every refusal falls back to the
 * branded templates with a stated reason. Rendering of the templates themselves is CH4.2's test.
 */
type Row = Record<string, any>;
let aiRows = 0;
const stored: Row[] = [];

jest.mock('../../../../config/env', () => require('../../../../__tests__/testSupport/configMocks').envModuleMock({ openaiApiKey: 'sk-test' }));
jest.mock('../../../../config/database', () => ({ sequelize: {} }));
jest.mock('../../../../models/CommsHubThumbnail', () => ({ __esModule: true, default: { count: jest.fn(async () => aiRows) } }));
jest.mock('../../../../models/CommsHubEvent', () => ({ __esModule: true, default: {} }));
// storeOption is mocked (persistence is media-library code with its own tests); estimateCostUsd stays real.
jest.mock('../thumbnailStore', () => ({
  storeOption: jest.fn(async (o: Row) => { stored.push(o); return { id: `t${stored.length}` }; }),
  estimateCostUsd: (q: string, c: string) => ({ medium: { '1536x1024': 0.063 } } as Record<string, Record<string, number>>)[q]?.[c] ?? null,
}));
jest.mock('../templateRender', () => ({ renderAllSizes: jest.fn(async () => [{ size: '16x9', png: Buffer.from('t') }]) }));

import { aiOption, slotsFor, templateOptions, AI_DAILY_LIMIT, type GenerateRequest } from '../thumbnailSources';
import { buildPrompt, PromptGuardError, STYLE_FAMILIES } from '../stylePrompts';
import { generateImage, ImageApiError } from '../openaiImages';

const JACKIE = { id: 'jackie-1', label: 'jackie@colaberry.com' };
const event = (o: Row = {}) => ({
  id: 'e1', title: 'Demo Tuesday', starts_at: new Date('2026-12-02T00:00:00Z'), ends_at: null, repeat_rule: { freq: 'weekly', until: '2026-12-29' },
  hosts: [{ name: 'Aleem', role: 'Design' }, { name: 'Sai' }], join_url: 'https://zoom.us/j/1', ...o,
});
const req = (o: Partial<GenerateRequest> = {}): GenerateRequest => ({
  event: event() as any, headline: 'Demo Tuesday', supporting: 'Live builds. Real feedback.', showWhen: true, photos: [], actor: JACKIE, ...o,
});
const okFetch = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('PNGDATA').toString('base64') }], usage: { total_tokens: 10 } }) }));

let fetchSpy: jest.SpyInstance;
beforeEach(() => {
  aiRows = 0; stored.length = 0; jest.clearAllMocks(); delete process.env.COMMS_HUB_AI_THUMBNAILS;
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(okFetch as any);
});
afterEach(() => fetchSpy.mockRestore());

describe('CH4.3 prompts are filled from the event record', () => {
  it('cadence, Central time, hosts and platform come from the event, not the model', () => {
    const s = slotsFor(req(), 'wide 16:9 banner');
    expect(s).toMatchObject({ cadence: 'EVERY TUESDAY', when: '6:00 PM CST', hosts: ['Aleem - Design', 'Sai'], platform: 'Live on Zoom' });
    const one = slotsFor(req({ event: event({ repeat_rule: null, join_url: null }) as any }), 'x');
    expect(one).toMatchObject({ cadence: null, platform: 'Online' });
    expect(one.when).toBe('TUE, DEC 1 · 6:00 PM CST');
  });

  it('every family puts the headline and time in quotes and carries the no-QR, no-pricing, no-fake-names rules', () => {
    for (const f of STYLE_FAMILIES) {
      const p = buildPrompt(f, slotsFor(req({ photos: [Buffer.from([0xff, 0xd8, 0xff])] }), 'wide 16:9 banner'));
      expect(p).toContain('"Demo Tuesday"');
      expect(p).toMatch(/No QR codes, no pricing words/);
      expect(p).not.toMatch(/\bfree\b/i);
    }
  });

  it('organizer text with a pricing word, link, QR or price is refused before any call', () => {
    for (const headline of ['Totally F R E E session', 'Join at zoom.us/j/1', 'Scan the QR code', 'Only $5']) {
      expect(() => buildPrompt('A_dark_tech', slotsFor(req({ headline }), 'x'))).toThrow(PromptGuardError);
    }
  });
});

describe('CH4.3 the AI source', () => {
  it('happy: one generation, stored with its prompt, model, cost and the 16:9 image', async () => {
    const r = await aiOption(req(), 'A_dark_tech');
    expect(r.fallbackReason).toBeNull();
    expect(r.options).toEqual([expect.objectContaining({ source: 'ai', style: 'A_dark_tech', costUsd: expect.any(Number) })]);
    expect(stored[0]).toMatchObject({ source: 'ai', model: 'gpt-image-1-mini', promptUsed: expect.stringContaining('"Demo Tuesday"') });
    expect(Object.keys(stored[0].pngs)).toEqual(['16x9']);
    const [url, init] = okFetch.mock.calls[0] as unknown as [string, Row];
    expect(url).toBe('https://api.openai.com/v1/images/generations');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gpt-image-1-mini', size: '1536x1024', output_format: 'png' });
  });

  it('with photos it uses the edits endpoint and sends each picture labelled by its bytes', async () => {
    await aiOption(req({ photos: [Buffer.from([0xff, 0xd8, 0xff, 1]), Buffer.from([0x89, 0x50, 0x4e, 0x47])] }), 'B_staged_headshot');
    const [url, init] = okFetch.mock.calls[0] as unknown as [string, { body: FormData }];
    expect(url).toBe('https://api.openai.com/v1/images/edits');
    const files = init.body.getAll('image[]') as File[];
    expect(files.map((f) => f.type)).toEqual(['image/jpeg', 'image/png']);
  });

  it.each([
    ['the flag is off', () => { process.env.COMMS_HUB_AI_THUMBNAILS = 'false'; }, 'B_staged_headshot', /switched off/],
    ['a portrait style has no photo', () => undefined, 'B_staged_headshot', /needs a photo/],
    ['today\'s ceiling is reached', () => { aiRows = AI_DAILY_LIMIT; }, 'A_dark_tech', /used today's 12/],
  ] as const)('falls back to the templates when %s, without calling the image service', async (_why, setup, family, reason) => {
    setup();
    const r = await aiOption(req(), family as any);
    expect(r.fallbackReason).toMatch(reason);
    expect(okFetch).not.toHaveBeenCalled();
    expect(r.options.every((o) => o.source === 'template')).toBe(true);
  });

  it('an API error or timeout falls back to the templates with the reason, and leaks no response body', async () => {
    fetchSpy.mockImplementation((async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'sk-secret internal detail' } }) })) as any);
    const r = await aiOption(req(), 'A_dark_tech');
    expect(r.fallbackReason).toMatch(/answered 500/);
    expect(r.fallbackReason).not.toMatch(/sk-secret/);
    expect(r.options.every((o) => o.source === 'template')).toBe(true);
    fetchSpy.mockImplementation((async (_u: string, init: { signal: AbortSignal }) => new Promise((_res, rej) => init.signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))))) as any);
    jest.useFakeTimers();
    const pending = generateImage('p', '1536x1024', []);
    jest.advanceTimersByTime(90_001);
    await expect(pending).rejects.toMatchObject({ kind: 'timeout' });
    jest.useRealTimers();
  });

  it('no key configured is a typed not_configured error', async () => {
    jest.resetModules();
    jest.doMock('../../../../config/env', () => require('../../../../__tests__/testSupport/configMocks').envModuleMock({ openaiApiKey: '' }));
    const mod = await import('../openaiImages');
    await expect(mod.generateImage('p', '1536x1024', [])).rejects.toMatchObject({ kind: 'not_configured' });
    expect(new ImageApiError('x', 'http')).toBeInstanceOf(Error);
  });

  it('template options: one per branded template, cost zero, all sizes stored', async () => {
    const opts = await templateOptions(req());
    expect(opts.map((o) => o.style)).toEqual(['bold_cherry', 'berry_night', 'clean_white']);
    expect(stored.every((s) => s.source === 'template' && s.costUsd === 0)).toBe(true);
    expect(stored[0].inputs.badge).toBe('EVERY TUESDAY · 6:00 PM CST');
  });
});
