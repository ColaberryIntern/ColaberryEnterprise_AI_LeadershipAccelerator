/**
 * Campus v20 N3 (C134): Manage the TV. Staff add a link, rename, reorder, set who sees it and on air, and remove (asking first);
 * every change answers with the whole playlist and tells the open TV to follow. The server's words are shown on a failure.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { ManagedShort } from '../../../services/colaberryTvApi';

const mockManaged = jest.fn();
const mockAdd = jest.fn();
const mockUpdate = jest.fn();
const mockOrder = jest.fn();
const mockRemove = jest.fn();
jest.mock('../../../services/colaberryTvApi', () => ({
  ...jest.requireActual('../../../services/colaberryTvApi'),
  getManaged: () => mockManaged(), addShortLink: (u: string) => mockAdd(u), updateShort: (id: string, p: unknown) => mockUpdate(id, p),
  reorderShorts: (ids: string[]) => mockOrder(ids), removeShort: (id: string) => mockRemove(id),
}));
// eslint-disable-next-line import/first
import TvManager from '../now/TvManager';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const row = (n: number, o: Partial<ManagedShort> = {}): ManagedShort =>
  ({ id: `id-${n}`, youtube_id: `yt_short_0${n}`.slice(0, 11), title: `Short ${n}`, duration_s: null, audience: 'all', on_air: true, position: n, ...o });
const ROWS = [row(1), row(2), row(3)];

let container: HTMLDivElement;
let root: Root;
const onChanged = jest.fn();
const onClose = jest.fn();
const q = (s: string) => container.querySelector(s) as HTMLElement | null;
const all = (s: string) => Array.from(container.querySelectorAll(s)) as HTMLElement[];
const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); }); };
const press = (el: Element | null) => act(() => { (el as HTMLElement).click(); });
const type = (el: Element | null, v: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v); (el as HTMLElement).dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); });
};
async function open(playing: string | null = null): Promise<void> {
  act(() => { root.render(<TvManager playingId={playing} onChanged={onChanged} onClose={onClose} />); });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  for (const m of [mockManaged, mockAdd, mockUpdate, mockOrder, mockRemove, onChanged, onClose]) m.mockReset();
  mockManaged.mockResolvedValue({ videos: ROWS });
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('lists the playlist in play order with the spec copy, marking what is playing now', async () => {
  await open('yt_short_02');
  expect(all('[data-testid="cn-mgr-title"]').map((e) => (e as HTMLInputElement).value)).toEqual(['Short 1', 'Short 2', 'Short 3']);
  expect(container.textContent).toContain('This is the Colaberry TV playlist on Colaberry Now, in play order. Changes show right away for everyone watching.');
  expect(all('[data-testid="cn-mgr-row"]')[1].textContent).toContain('▶ playing now');
});

it('adds a link, lists the new row, clears the box, and tells the open TV', async () => {
  await open();
  mockAdd.mockResolvedValue({ videos: [...ROWS, row(4, { title: 'From YouTube' })], created: true });
  type(q('[data-testid="cn-mgr-link"]'), 'https://youtube.com/shorts/Pa5J5T6MZok');
  press(q('[data-testid="cn-mgr-add"]'));
  await flush();
  expect(mockAdd).toHaveBeenCalledWith('https://youtube.com/shorts/Pa5J5T6MZok');
  expect(all('[data-testid="cn-mgr-row"]')).toHaveLength(4);
  expect((q('[data-testid="cn-mgr-link"]') as HTMLInputElement).value).toBe('');
  expect(onChanged).toHaveBeenCalledTimes(1);
});

it('a bad link shows the server error and keeps what was typed', async () => {
  await open();
  mockAdd.mockRejectedValue({ response: { data: { error: 'That is not a YouTube link we can play' } } });
  type(q('[data-testid="cn-mgr-link"]'), 'https://example.com/x');
  press(q('[data-testid="cn-mgr-add"]'));
  await flush();
  expect(q('[data-testid="cn-mgr-error"]')!.textContent).toBe('That is not a YouTube link we can play');
  expect((q('[data-testid="cn-mgr-link"]') as HTMLInputElement).value).toBe('https://example.com/x');
  expect(onChanged).not.toHaveBeenCalled();
});

it('rename saves when you leave the box, and only if it changed', async () => {
  await open();
  mockUpdate.mockResolvedValue({ videos: [row(1, { title: 'Week 1 recap' }), row(2), row(3)] });
  const t = all('[data-testid="cn-mgr-title"]')[0];
  act(() => { t.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(mockUpdate).not.toHaveBeenCalled();
  type(t, 'Week 1 recap');
  act(() => { t.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await flush();
  expect(mockUpdate).toHaveBeenCalledWith('id-1', { title: 'Week 1 recap' });
});

it('▼ sends the new order (every id once); the first ▲ and the last ▼ are disabled', async () => {
  await open();
  mockOrder.mockResolvedValue({ videos: [row(2), row(1), row(3)] });
  expect((all('[data-testid="cn-mgr-up"]')[0] as HTMLButtonElement).disabled).toBe(true);
  expect((all('[data-testid="cn-mgr-down"]')[2] as HTMLButtonElement).disabled).toBe(true);
  press(all('[data-testid="cn-mgr-down"]')[0]);
  await flush();
  expect(mockOrder).toHaveBeenCalledWith(['id-2', 'id-1', 'id-3']);
  expect(onChanged).toHaveBeenCalled();
});

it('who sees it and on air send a change', async () => {
  await open();
  mockUpdate.mockResolvedValue({ videos: ROWS });
  type(all('[data-testid="cn-mgr-aud"]')[1], 'members');
  await flush();
  expect(mockUpdate).toHaveBeenCalledWith('id-2', { audience: 'members' });
  press(all('[data-testid="cn-mgr-air"]')[2]);
  await flush();
  expect(mockUpdate).toHaveBeenCalledWith('id-3', { on_air: false });
});

it('remove asks first; Keep cancels; Remove deletes', async () => {
  await open();
  mockRemove.mockResolvedValue({ videos: [row(2), row(3)] });
  press(all('[data-testid="cn-mgr-del"]')[0]);
  expect(mockRemove).not.toHaveBeenCalled();
  press(Array.from(container.querySelectorAll('.cn-mgr-keep'))[0]);
  expect(q('[data-testid="cn-mgr-del-yes"]')).toBeNull();
  press(all('[data-testid="cn-mgr-del"]')[0]);
  press(q('[data-testid="cn-mgr-del-yes"]'));
  await flush();
  expect(mockRemove).toHaveBeenCalledWith('id-1');
  expect(all('[data-testid="cn-mgr-row"]')).toHaveLength(2);
});

it('a playlist that fails to load says so', async () => {
  mockManaged.mockRejectedValue(new Error('down'));
  await open();
  expect(q('[data-testid="cn-mgr-error"]')!.textContent).toBe('We can’t load the playlist right now.');
});
