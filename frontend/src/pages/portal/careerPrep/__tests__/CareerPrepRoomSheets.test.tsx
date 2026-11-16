import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import CareerPrepRoomPage from '../CareerPrepRoomPage';
import { useCareerPrepFlag } from '../../../../components/careerPrep/careerPrepFlag';
import { askCoraApi, fetchPrepDashboard, fetchPrepSummary, fetchRemindersApi } from '../../../../components/careerPrep/careerPrepApi';
import { fetchHireInterviews } from '../../../../services/hireStudioApi';
import { resetCareerPrepSummaryCache } from '../../../../components/careerPrep/useCareerPrepSummary';
import { SHEETS } from '../../../../components/careerPrep/logic/sheets';

/**
 * Career Prep v27 (CP4.6), the acceptance in full: EVERY sheet opens from each of the three ways in (its URL,
 * Cora, the jump bar); focus lands on the sheet's title; browser Back closes it; and focus returns to the
 * element that opened it. Plus the layer rule: Esc closes only the top layer.
 */
jest.mock('../../../../components/careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../../services/hireStudioApi', () => ({ fetchHireInterviews: jest.fn() }));
jest.mock('../../../../components/careerPrep/careerPrepApi', () => ({ fetchPrepSummary: jest.fn(), fetchPrepDashboard: jest.fn(), postInterview: jest.fn(), askCoraApi: jest.fn(), fetchRemindersApi: jest.fn() }));
beforeEach(() => {
  (useCareerPrepFlag as jest.Mock).mockReturnValue(true);
  (fetchPrepSummary as jest.Mock).mockResolvedValue({ stops: {}, interviews: [], interviewCount: 0, today: '2026-11-16' });
  (fetchPrepDashboard as jest.Mock).mockResolvedValue({ interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 });
  (fetchRemindersApi as jest.Mock).mockResolvedValue([]);
  (fetchHireInterviews as jest.Mock).mockResolvedValue([]);
  resetCareerPrepSummaryCache();
});

let host: HTMLDivElement;
let root: Root;
let back: () => void = () => undefined;
function Probe(): React.ReactElement {
  const nav = useNavigate();
  const loc = useLocation();
  back = () => nav(-1);
  return <span data-testid="hash" hidden>{loc.hash}</span>;
}
async function mount(entries: string[]): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(<MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}><CareerPrepRoomPage /><Probe /></MemoryRouter>); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
afterEach(() => { act(() => root.unmount()); host.remove(); });

const ROOM = '/portal/career/room';
const sheetOpen = (k: string) => host.querySelector(`[data-testid="cp-sheet-${k}"]`) !== null;
const setValue = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
};
const ASK: Record<string, string> = { interviews: 'show my interviews', inbox: 'my inbox', offers: 'my offers', applications: 'my applications', resume: 'my resume' };

async function viaCora(key: string): Promise<HTMLElement> {
  const box = host.querySelector('#cp-ask-input') as HTMLTextAreaElement;
  box.focus();
  await act(async () => { setValue(box, ASK[key]); });
  await act(async () => { (host.querySelector('form.cp-ask') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  return box;
}
async function viaJump(key: string): Promise<HTMLElement> {
  const opener = host.querySelector('#cp-ask-input') as HTMLTextAreaElement;
  opener.focus();
  await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); });
  const input = host.querySelector('[data-testid="cp-jump-input"]') as HTMLInputElement;
  await act(async () => { setValue(input, SHEETS.find((s) => s.key === key)!.title); });
  await act(async () => { input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
  return opener;
}

describe.each(SHEETS.map((s) => s.key))('the %s sheet (CP4.6)', (key) => {
  it('opens from its URL with focus on its title, and browser Back closes it', async () => {
    await mount([ROOM, `${ROOM}#${key}`]);
    expect(sheetOpen(key)).toBe(true);
    expect(document.activeElement?.id).toBe('cp-sheet-title');
    await act(async () => back());
    expect(sheetOpen(key)).toBe(false);
    expect(host.querySelector('[data-testid="cp-room"]')).not.toBeNull();
  });

  it.each([['Cora', viaCora], ['the jump bar', viaJump]] as const)('opens from %s; Back closes it and focus returns to the opener', async (_name, open) => {
    await mount([ROOM]);
    const opener = await open(key);
    expect(sheetOpen(key)).toBe(true);
    expect(host.querySelector('[data-testid="hash"]')?.textContent).toBe(`#${key}`);
    expect(document.activeElement?.id).toBe('cp-sheet-title');
    expect(askCoraApi).not.toHaveBeenCalled();
    await act(async () => back());
    expect(sheetOpen(key)).toBe(false);
    expect(document.activeElement).toBe(opener);
  });
});

describe('Esc closes only the top layer (CP4.6)', () => {
  it('jump bar over a sheet over the room: Esc closes the jump bar, then the sheet, then nothing else of the room', async () => {
    await mount([ROOM, `${ROOM}#offers`]);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true })); });
    const esc = () => act(async () => { (document.activeElement ?? document).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    await esc();
    expect(host.querySelector('[data-testid="cp-jump"]')).toBeNull();
    expect(sheetOpen('offers')).toBe(true);
    expect(document.activeElement?.id).toBe('cp-sheet-title');
    await esc();
    expect(sheetOpen('offers')).toBe(false);
    expect(host.querySelector('[data-testid="cp-room"]')).not.toBeNull();
  });

  it('Tab stays inside an open sheet (it is a modal dialog)', async () => {
    await mount([ROOM, `${ROOM}#resume`]);
    const sheet = host.querySelector('[data-testid="cp-sheet-resume"]') as HTMLElement;
    const tabbables = Array.from(sheet.querySelectorAll<HTMLElement>('a[href], button:not([tabindex="-1"])'));
    tabbables[tabbables.length - 1].focus();
    await act(async () => { sheet.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(tabbables[0]);
  });
});
