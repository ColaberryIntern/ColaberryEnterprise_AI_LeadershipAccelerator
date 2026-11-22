import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import axe from 'axe-core';
import ThumbnailStudio from '../ThumbnailStudio';
import { GIVE_UP_MS, POLL_MS, TOO_LONG } from '../useThumbnailStudio';
import * as api from '../../../../../../services/commsHubApi';
import type { HubEvent, StudioView, ThumbJob, ThumbOption } from '../../../../../../services/commsHubApi';

jest.mock('../../../../../../services/commsHubApi', () => ({
  ...jest.requireActual('../../../../../../services/commsHubApi'),
  listThumbnails: jest.fn(), generateThumbnails: jest.fn(), getThumbnailJob: jest.fn(), changeThumbnail: jest.fn(), chooseThumbnail: jest.fn(),
  downloadThumbnail: jest.fn(), uploadThumbnail: jest.fn(), listEventPhotos: jest.fn(), addEventPhoto: jest.fn(), removeEventPhoto: jest.fn(),
}));

/** CH4.4 the thumbnail studio, rendered: generate and poll, the 120 s fallback, pick, change, sizes, use, download, upload, a11y. */
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
const m = <T,>(f: T): jest.Mock => f as unknown as jest.Mock;
const settle = async (): Promise<void> => { for (let i = 0; i < 8; i += 1) await act(async () => { await Promise.resolve(); }); };
const tick = async (ms: number): Promise<void> => { await act(async () => { jest.advanceTimersByTime(ms); }); await settle(); };

const EVENT: HubEvent = {
  id: 'e1', title: 'Demo Tuesday', event_type: 'session', audience: { kind: 'all_members' }, status: 'scheduled',
  starts_at: '2026-12-02T00:00:00.000Z', ends_at: null, central: { date: '2026-12-01', start_time: '18:00', end_time: null, label: 'x' },
  repeat_rule: null, next_occurrence_at: null, upcoming_preview: [], join_url: null, registration_url: null, hosts: [],
  description: 'About.', placement: { calendar: true, events_page: true, campus_rail: true }, thumbnail_id: null, broadcast_occurrence_id: null, ccpp_event_id: null, ccpp_missing_since: null,
  created_at: '2026-11-20T00:00:00.000Z', updated_at: '2026-11-20T00:00:00.000Z',
};
const opt = (id: string, o: Partial<ThumbOption> = {}): ThumbOption => ({
  id, source: 'template', style: 'bold_cherry', style_label: 'Bold cherry', prompt: null, headline: 'Demo Tuesday', supporting: null, show_when: true,
  cost_usd: 0, created_at: '2026-11-20T15:00:00.000Z', chosen: false, cropped: [],
  previews: { '16x9': `https://x/${id}-w.png`, '1x1': `https://x/${id}-s.png`, '3x1': `https://x/${id}-b.png` }, ...o,
});
const view = (options: ThumbOption[], chosen: string | null = null): StudioView => ({ options, chosen_id: chosen, ai: { enabled: true, used_today: 3, daily_limit: 12, batch: 3 } });
const job = (o: Partial<ThumbJob> = {}): ThumbJob => ({ id: 'j1', event_id: 'e1', kind: 'template', status: 'running', option_ids: [], notice: null, error: null, ...o });

async function render(ev: HubEvent = EVENT): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<ThumbnailStudio event={ev} locked={ev.status === 'cancelled'} />); });
  await settle();
}
beforeEach(() => {
  jest.useFakeTimers();
  m(api.listEventPhotos).mockResolvedValue([]);
  m(api.listThumbnails).mockResolvedValue(view([]));
});
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); jest.useRealTimers(); });

const $ = <T extends Element = HTMLElement>(sel: string): T => container.querySelector(sel) as T;
const btn = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim().startsWith(label)) as HTMLButtonElement;
const exact = (label: string): HTMLButtonElement => Array.from(container.querySelectorAll('button')).find((b) => (b.textContent ?? '').trim() === label) as HTMLButtonElement;
const click = async (el: Element): Promise<void> => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); await settle(); };
const setValue = async (id: string, value: string): Promise<void> => {
  const el = $<HTMLInputElement | HTMLSelectElement>(`#${id}`);
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value); el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
};
const setFile = async (id: string, file: File): Promise<void> => {
  const el = $<HTMLInputElement>(`#${id}`);
  Object.defineProperty(el, 'files', { value: [file], configurable: true });
  await act(async () => { el.dispatchEvent(new Event('change', { bubbles: true })); });
};
const status = (): string => $('[role="status"]').textContent ?? '';

describe('CH4.4 generate', () => {
  it('templates: sends the form, polls every 3 s, then shows and selects the new options', async () => {
    await render();
    expect(($<HTMLInputElement>('#ch-studio-headline')).value).toBe('Demo Tuesday');
    await setValue('ch-studio-supporting', 'Live builds. Real feedback.');
    m(api.generateThumbnails).mockResolvedValue(job());
    m(api.getThumbnailJob).mockResolvedValue(job({ status: 'done', option_ids: ['t1', 't2', 't3'] }));
    m(api.listThumbnails).mockResolvedValue(view([opt('t1'), opt('t2', { style: 'berry_night', style_label: 'Berry night' }), opt('t3')]));
    await click(btn('Generate thumbnails'));
    expect(api.generateThumbnails).toHaveBeenCalledWith('e1', { style: 'templates', headline: 'Demo Tuesday', supporting: 'Live builds. Real feedback.', show_when: true });
    expect(status()).toContain('Making the branded templates');
    expect(api.getThumbnailJob).not.toHaveBeenCalled();
    await tick(POLL_MS);
    expect(api.getThumbnailJob).toHaveBeenCalledWith('e1', 'j1');
    expect(container.querySelectorAll('input[name="ch-thumb-option"]')).toHaveLength(3);
    expect(($<HTMLInputElement>('#ch-opt-t1')).checked).toBe(true);
    expect(status()).toContain('3 new options are ready below.');
  });

  it('AI: says how many pictures and the day\'s count; Try 3 more appears once that style has options', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('a1', { source: 'ai', style: 'A_dark_tech', style_label: 'Dark tech poster', prompt: 'A wide 16:9 banner. Dark navy...', cost_usd: 0.063 })]));
    await render();
    expect(btn('Try 3 more')).toBeUndefined();
    await setValue('ch-studio-style', 'A_dark_tech');
    expect($('#ch-studio-style-help').textContent).toContain('Makes 3 AI pictures. Today: 3 of 12.');
    expect(btn('Try 3 more')).toBeDefined();
    expect(container.textContent).toContain('about $0.06');
    expect($('.ch-studio-prompt summary').textContent).toBe('Prompt used');
    m(api.generateThumbnails).mockResolvedValue(job({ kind: 'ai' }));
    m(api.getThumbnailJob).mockResolvedValue(job({ kind: 'ai' }));
    await click(btn('Try 3 more'));
    expect(m(api.generateThumbnails).mock.calls[0][1].style).toBe('A_dark_tech');
    expect(status()).toContain('Making 3 AI pictures');
    expect(btn('Generating...').disabled).toBe(true);
  });

  it('gives up after 120 s, says so, and makes the branded templates instead', async () => {
    await render();
    await setValue('ch-studio-style', 'C_open_house');
    m(api.generateThumbnails).mockResolvedValueOnce(job({ id: 'slow', kind: 'ai' })).mockResolvedValueOnce(job({ id: 'tpl' }));
    m(api.getThumbnailJob).mockImplementation(async (_e: string, id: string) => (id === 'slow' ? job({ id: 'slow', kind: 'ai' }) : job({ id: 'tpl', status: 'done', option_ids: ['t1'] })));
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await click(btn('Generate thumbnails'));
    for (let t = 0; t < GIVE_UP_MS; t += POLL_MS) await tick(POLL_MS);
    await tick(POLL_MS);
    expect(m(api.getThumbnailJob).mock.calls.filter((c) => c[1] === 'slow').length).toBe(GIVE_UP_MS / POLL_MS);
    expect(m(api.generateThumbnails).mock.calls[1][1]).toMatchObject({ style: 'templates', headline: 'Demo Tuesday' });
    expect(status()).toContain(TOO_LONG);
    expect(($<HTMLInputElement>('#ch-opt-t1')).checked).toBe(true);
  });

  it('closing the studio while it waits starts nothing more (no template fallback nobody asked for)', async () => {
    await render();
    await setValue('ch-studio-style', 'C_open_house');
    m(api.generateThumbnails).mockResolvedValue(job({ id: 'slow', kind: 'ai' }));
    m(api.getThumbnailJob).mockResolvedValue(job({ id: 'slow', kind: 'ai' }));
    await click(btn('Generate thumbnails'));
    act(() => { root.unmount(); });
    for (let t = 0; t <= GIVE_UP_MS; t += POLL_MS) await tick(POLL_MS);
    expect(api.generateThumbnails).toHaveBeenCalledTimes(1);
    root = createRoot(container); // afterEach unmounts again
  });

  it('a refused headline or a failed job shows the server\'s sentence', async () => {
    await render();
    m(api.generateThumbnails).mockRejectedValueOnce({ response: { data: { error: 'The text "FREE class" contains a word the TWC rules do not allow on Colaberry promotions.' } } });
    await click(btn('Generate thumbnails'));
    expect($('[role="alert"]').textContent).toContain('the TWC rules do not allow');
    m(api.generateThumbnails).mockResolvedValue(job());
    m(api.getThumbnailJob).mockResolvedValue(job({ status: 'failed', error: 'The pictures could not be made. Try again, or pick a template.' }));
    await click(btn('Generate thumbnails'));
    await tick(POLL_MS);
    expect($('[role="alert"]').textContent).toBe('The pictures could not be made. Try again, or pick a template.');
  });

  it('an empty headline is caught before any call', async () => {
    await render();
    await setValue('ch-studio-headline', '  ');
    await click(btn('Generate thumbnails'));
    expect(api.generateThumbnails).not.toHaveBeenCalled();
    expect($('[role="alert"]').textContent).toBe('Add a headline.');
  });
});

describe('CH4.4 pick, sizes, use, download', () => {
  beforeEach(() => { m(api.listThumbnails).mockResolvedValue(view([opt('t1'), opt('t2', { style: 'clean_white', style_label: 'Clean white', cropped: ['1x1'] })])); });

  it('picking an option and a size changes the preview; a cropped size says so', async () => {
    await render();
    await click($('#ch-opt-t2'));
    expect(($<HTMLImageElement>('.ch-studio-preview img')).src).toBe('https://x/t2-w.png');
    await click($('#ch-size-1x1'));
    expect(($<HTMLImageElement>('.ch-studio-preview img')).src).toBe('https://x/t2-s.png');
    expect($<HTMLImageElement>('.ch-studio-preview img').alt).toBe('Clean white, Square flyer, 1:1: Demo Tuesday');
    expect(container.textContent).toContain('This size is cropped from the picture');
  });

  it('Use for this event: saves the choice, then says where it shows; the button then reads "In use"', async () => {
    await render();
    m(api.chooseThumbnail).mockResolvedValue('t1');
    m(api.listThumbnails).mockResolvedValue(view([opt('t1', { chosen: true }), opt('t2')], 't1'));
    await click(btn('Use for this event'));
    expect(api.chooseThumbnail).toHaveBeenCalledWith('e1', 't1');
    expect(status()).toContain('It shows on the member Events page.');
    expect(btn('In use for this event').disabled).toBe(true);
  });

  it('Download: the PNG at the chosen size, named after the event and size', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    m(api.downloadThumbnail).mockResolvedValue(blob);
    const created: string[] = [];
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = jest.fn(() => 'blob:1');
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = jest.fn();
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { created.push(this.download); });
    await render();
    await click($('#ch-size-3x1'));
    await click(btn('Download'));
    expect(api.downloadThumbnail).toHaveBeenCalledWith('e1', 't1', '3x1');
    expect(created).toEqual(['demo-tuesday-3x1.png']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1');
    clickSpy.mockRestore();
  });
});

describe('CH4.4 ask for a change and upload', () => {
  it('sends the words for the picked option, shows the plan, and selects the new option', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await render();
    m(api.changeThumbnail).mockResolvedValue({ job: job({ id: 'j2' }), summary: 'White template, shorter headline.' });
    m(api.getThumbnailJob).mockResolvedValue(job({ id: 'j2', status: 'done', option_ids: ['t9'] }));
    await setValue('ch-studio-change-text', 'white, shorter headline');
    await click(btn('Update'));
    expect(api.changeThumbnail).toHaveBeenCalledWith('e1', 't1', 'white, shorter headline');
    expect(status()).toContain('White template, shorter headline. Making it now...');
    m(api.listThumbnails).mockResolvedValue(view([opt('t9', { style: 'clean_white' }), opt('t1')]));
    await tick(POLL_MS);
    expect(($<HTMLInputElement>('#ch-opt-t9')).checked).toBe(true);
    expect(status()).toContain('White template, shorter headline. One new option is ready below.');
    expect(($<HTMLInputElement>('#ch-studio-change-text')).value).toBe('');
  });

  it('a change the server could not map: its plain sentence, shown as an alert', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await render();
    m(api.changeThumbnail).mockRejectedValue({ response: { data: { error: 'I could not turn that into a change to this picture.' } } });
    await setValue('ch-studio-change-text', 'move the logo');
    await click(btn('Update'));
    expect($('[role="alert"]').textContent).toBe('I could not turn that into a change to this picture.');
  });

  it('an uploaded option cannot be "changed": the step is not offered', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('u1', { source: 'upload', style: 'upload', style_label: 'Your upload' })]));
    await render();
    expect($('#ch-studio-change-text')).toBeNull();
  });

  it('Upload my own: a picture and what it shows, then it is the selected option', async () => {
    await render();
    await click(btn('Upload my own instead'));
    expect(btn('Upload my own instead').getAttribute('aria-expanded')).toBe('true');
    await click(exact('Upload'));
    expect($('[role="alert"]').textContent).toBe('Choose a picture first.');
    await setFile('ch-own-file', new File(['x'], 'mine.png', { type: 'image/png' }));
    await setValue('ch-own-alt', 'The team on stage');
    m(api.uploadThumbnail).mockResolvedValue('u1');
    m(api.listThumbnails).mockResolvedValue(view([opt('u1', { source: 'upload', style: 'upload', style_label: 'Your upload' })]));
    await click(exact('Upload'));
    expect(m(api.uploadThumbnail).mock.calls[0][0]).toBe('e1');
    expect(m(api.uploadThumbnail).mock.calls[0][2]).toBe('The team on stage');
    expect(($<HTMLInputElement>('#ch-opt-u1')).checked).toBe(true);
    expect($('#ch-own-file')).toBeNull();
  });
});

describe('CH4.4 accessibility', () => {
  const axeViolations = async (): Promise<string[]> => {
    jest.useRealTimers();
    const r = await axe.run(container, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return r.violations.map((v) => `${v.id}: ${v.help}`);
  };

  it('zero axe violations with options, an AI prompt and the upload form open', async () => {
    m(api.listEventPhotos).mockResolvedValue([{ id: 'p1', media_asset_id: 'a', alt_text: 'Aleem at the whiteboard', width: 10, height: 10, url: 'https://x/p.png' }]);
    m(api.listThumbnails).mockResolvedValue(view([opt('t1'), opt('a1', { source: 'ai', style: 'A_dark_tech', style_label: 'Dark tech poster', prompt: 'A wide banner.' })]));
    await render();
    await click(btn('Upload my own instead'));
    expect(await axeViolations()).toEqual([]);
  });

  it('every control has a name: photo remove buttons say which picture; options are labelled radios', async () => {
    m(api.listEventPhotos).mockResolvedValue([{ id: 'p1', media_asset_id: 'a', alt_text: 'Aleem at the whiteboard', width: 10, height: 10, url: 'https://x/p.png' }]);
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await render();
    expect(container.querySelector('button[aria-label="Remove picture: Aleem at the whiteboard"]')).not.toBeNull();
    for (const id of ['ch-photo-file', 'ch-studio-style', 'ch-studio-headline', 'ch-studio-supporting', 'ch-studio-when', 'ch-opt-t1', 'ch-studio-change-text', 'ch-size-16x9']) {
      expect(container.querySelector(`label[for="${id}"]`)).not.toBeNull();
    }
    expect(container.querySelector('label[for="ch-opt-t1"]')!.textContent).toContain('Option 1: Bold cherry');
  });

  it('focus order follows the steps: pictures, what it says (text, then style), pick one, change, sizes, then the actions', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await render();
    const sequence = ['#ch-photo-file', '#ch-studio-headline', '#ch-studio-supporting', '#ch-studio-when', '#ch-studio-style', '#ch-opt-t1', '#ch-studio-change-text', '#ch-size-16x9'];
    const focusable = Array.from(container.querySelectorAll<HTMLElement>('input, select, button, textarea, summary')).filter((el) => !(el as HTMLInputElement).disabled);
    const indexOf = (sel: string): number => focusable.indexOf($(sel));
    for (const sel of sequence) {
      act(() => { $(sel).focus(); });
      expect(document.activeElement).toBe($(sel));
    }
    const positions = sequence.map(indexOf);
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const actions = ['Use for this event', 'Download', 'Upload my own instead'].map((l) => focusable.indexOf(btn(l)));
    expect(Math.min(...actions)).toBeGreaterThan(positions[positions.length - 1]);
  });

  it('+ Add: choosing a file asks what it shows (focus moves there); it is required; then the picture is saved', async () => {
    await render();
    expect($('label[for="ch-photo-file"]').textContent).toBe('+ Add a photo, screenshot or logo');
    expect($('#ch-photo-alt')).toBeNull();
    await setFile('ch-photo-file', new File(['x'], 'aleem.jpg', { type: 'image/jpeg' }));
    expect(document.activeElement).toBe($('#ch-photo-alt'));
    expect($('label[for="ch-photo-alt"]').textContent).toBe('What does aleem.jpg show?');
    await click(exact('Save'));
    expect(api.addEventPhoto).not.toHaveBeenCalled();
    expect($('[role="alert"]').textContent).toContain('Describe the picture');
    m(api.addEventPhoto).mockResolvedValue([{ id: 'p1', media_asset_id: 'a', alt_text: 'Aleem at the whiteboard', width: 1, height: 1, url: 'https://x/p.png' }]);
    await setValue('ch-photo-alt', 'Aleem at the whiteboard');
    await click(exact('Save'));
    expect(m(api.addEventPhoto).mock.calls[0][2]).toBe('Aleem at the whiteboard');
    expect(container.querySelector('img[alt="Aleem at the whiteboard"]')).not.toBeNull();
    expect($('#ch-photo-alt')).toBeNull();
  });

  it('a cancelled event: everything that changes the thumbnail is disabled, and it says why', async () => {
    m(api.listThumbnails).mockResolvedValue(view([opt('t1')]));
    await render({ ...EVENT, status: 'cancelled' });
    expect(container.textContent).toContain('This event is cancelled, so its thumbnail cannot change.');
    for (const l of ['Generate thumbnails', 'Use for this event', 'Upload my own instead']) expect(btn(l).disabled).toBe(true);
    expect(btn('Download').disabled).toBe(false);
  });
});
