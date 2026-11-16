import React from 'react';
import fs from 'fs';
import path from 'path';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { filterJump, JUMP_ITEMS, sheetFromHash, SHEETS } from '../logic/sheets';
import { useSheet } from '../useSheet';
import { PageSheet } from '../PageSheet';
import { InterviewsSheet, joinOpen, SheetBody } from '../SheetBodies';
import { JumpBar } from '../JumpBar';
import { fetchHireInterviews, type HireInterview } from '../../../services/hireStudioApi';

jest.mock('../../../services/hireStudioApi', () => ({ fetchHireInterviews: jest.fn() }));
const hire = fetchHireInterviews as jest.Mock;

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(el: React.ReactElement): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(el); });
  return h;
}
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });
const flush = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const key = (k: string, opts: KeyboardEventInit = {}, target: EventTarget = document) => act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...opts })); });

let back: () => void = () => undefined;
function Harness(): React.ReactElement {
  const s = useSheet();
  const loc = useLocation();
  const nav = useNavigate();
  back = () => nav(-1);
  return (
    <>
      <span data-testid="hash">{loc.hash}</span>
      <button type="button" data-testid="opener" onClick={() => s.open('offers')}>Offers</button>
      {s.sheet && <PageSheet sheet={s.sheet} onClose={s.close} onSwitch={s.open}><SheetBody sheet={s.sheet} prep={[]} /></PageSheet>}
    </>
  );
}
const at = (url = '/portal/career/room') => mount(<MemoryRouter initialEntries={['/portal/career/room', url]} initialIndex={1}><Harness /></MemoryRouter>);
const hash = (h: HTMLElement) => h.querySelector('[data-testid="hash"]')?.textContent;

beforeEach(() => { hire.mockReset().mockResolvedValue([]); });

describe('sheets are hashes on the room URL (CP4.6)', () => {
  it('maps the five hashes, and nothing else, to a sheet', () => {
    expect(SHEETS.map((s) => s.key)).toEqual(['interviews', 'inbox', 'offers', 'applications', 'resume']);
    expect(sheetFromHash('#Offers')).toBe('offers');
    expect(sheetFromHash('#fees')).toBeNull();
    expect(sheetFromHash('')).toBeNull();
  });
  it('opens straight from the URL (an email link), focused on its title', () => {
    const h = at('/portal/career/room#resume');
    expect(h.querySelector('[data-testid="cp-sheet-resume"]')).not.toBeNull();
    expect(document.activeElement?.id).toBe('cp-sheet-title');
    expect(h.querySelector('[data-testid="cp-resume-sheet"] a')?.getAttribute('href')).toBe('/portal/portfolio');
  });
  it('opened in the app: the hash is set, focus goes to the title, and browser Back closes it with focus back on the opener', () => {
    const h = at();
    const opener = h.querySelector('[data-testid="opener"]') as HTMLButtonElement;
    opener.focus();
    act(() => opener.click());
    expect(hash(h)).toBe('#offers');
    expect(document.activeElement?.textContent).toBe('Offers');
    expect(document.activeElement?.id).toBe('cp-sheet-title');
    act(() => back());
    expect(h.querySelector('[data-testid="cp-sheet-offers"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it('Esc and "‹ Back to Career Prep" close it; moving sideways keeps one Back to close', () => {
    const h = at();
    act(() => (h.querySelector('[data-testid="opener"]') as HTMLButtonElement).click());
    act(() => (Array.from(h.querySelectorAll('.cp-sheet-tab')).find((b) => b.textContent === 'Applications') as HTMLButtonElement).click());
    expect(hash(h)).toBe('#applications');
    expect(h.querySelector('[data-testid="cp-notyet-applications"]')).not.toBeNull();
    key('Escape');
    expect(hash(h)).toBe('');
    act(() => (h.querySelector('[data-testid="opener"]') as HTMLButtonElement).click());
    act(() => (h.querySelector('[data-testid="cp-sheet-back"]') as HTMLButtonElement).click());
    expect(hash(h)).toBe('');
  });
  it('closing a sheet opened by a direct link clears the hash instead of leaving the room', () => {
    const h = at('/portal/career/room#inbox');
    act(() => (h.querySelector('[data-testid="cp-sheet-back"]') as HTMLButtonElement).click());
    expect(hash(h)).toBe('');
    expect(h.querySelector('[data-testid="opener"]')).not.toBeNull();
  });
});

describe('the offers sheet never shows a fee (CP4.6)', () => {
  it('says plainly that offers are not tracked yet, and no Career Prep sheet source mentions a fee', () => {
    const h = mount(<MemoryRouter><SheetBody sheet="offers" prep={[]} /></MemoryRouter>);
    expect(h.textContent).toContain('Offers are not tracked in the app yet');
    expect(h.textContent).not.toMatch(/fee/i);
    const dir = path.join(__dirname, '..');
    for (const f of ['SheetBodies.tsx', 'PageSheet.tsx', 'JumpBar.tsx', 'useSheet.ts', path.join('logic', 'sheets.ts'), 'careerPrepApi.ts']) {
      expect(fs.readFileSync(path.join(dir, f), 'utf8')).not.toMatch(/\bfees?\b/i);
    }
  });
});

describe('Your interviews sheet (CP4.6)', () => {
  const booked = (over: Partial<HireInterview> = {}): HireInterview => ({ id: 'h1', format: 'video', caseStudySlug: null, startsAt: '2026-11-17T20:00:00.000Z', minutes: 45, status: 'confirmed',
    employer: { name: 'Dana', company: 'Meridian Freight', role: 'AI Engineer', message: '' }, extraInterviewers: 0, recordRequested: false, roomUrl: 'https://meet.example/abc', createdAt: '2026-11-10T00:00:00Z', ...over } as HireInterview);
  it('Join the room opens 10 minutes before the start and closes at the end', () => {
    const start = Date.parse('2026-11-17T20:00:00.000Z');
    expect(joinOpen(booked(), start - 11 * 60_000)).toBe(false);
    expect(joinOpen(booked(), start - 10 * 60_000)).toBe(true);
    expect(joinOpen(booked(), start + 45 * 60_000)).toBe(true);
    expect(joinOpen(booked(), start + 46 * 60_000)).toBe(false);
    expect(joinOpen(booked({ status: 'requested' }), start)).toBe(false);
    expect(joinOpen(booked({ roomUrl: null }), start)).toBe(false);
  });
  it('lists booked interviews in Central with their status, and the ones the student added', async () => {
    hire.mockResolvedValue([booked()]);
    const h = mount(<MemoryRouter><InterviewsSheet now={Date.parse('2026-11-17T19:55:00Z')} prep={[
      { id: 'i1', source: 'real', company: 'Meridian Freight', role: 'AI Engineer', type: 'technical', target: 75 },
      { id: 'i2', source: 'practice', company: 'Practice', role: 'Data Analyst', type: 'behavioral', target: 70 }]} /></MemoryRouter>);
    await flush();
    const list = h.querySelector('[data-testid="cp-booked"]')?.textContent ?? '';
    expect(list).toContain('Meridian Freight · AI Engineer · Tuesday at 2:00 PM Central · 45 min · Confirmed');
    expect(h.querySelector('[data-testid="cp-booked"] a')?.textContent).toBe('Join the room');
    expect(h.textContent).toContain('Practice · Data Analyst · Practice');
    expect(h.textContent).not.toContain('Meridian Freight · AI Engineer · Added by you');
  });
  it('says so when nothing is booked, and when the list cannot load', async () => {
    const h = mount(<MemoryRouter><InterviewsSheet prep={[]} /></MemoryRouter>);
    await flush();
    expect(h.textContent).toContain('No employer has booked an interview with you yet.');
    act(() => { root!.unmount(); }); root = null; host?.remove();
    hire.mockRejectedValue(new Error('offline'));
    const h2 = mount(<MemoryRouter><InterviewsSheet prep={[]} /></MemoryRouter>);
    await flush();
    expect(h2.querySelector('[role="alert"]')?.textContent).toContain('Could not load your booked interviews');
  });
});

describe('the jump bar (CP4.6)', () => {
  it('lists every sheet plus the common actions, and filters by every word typed', () => {
    expect(JUMP_ITEMS.map((i) => i.id)).toEqual(['start', 'progress', 'plan', 'interviews', 'inbox', 'offers', 'applications', 'resume']);
    expect(filterJump(JUMP_ITEMS, 'your').map((i) => i.id)).toEqual(['progress', 'plan', 'interviews']);
    expect(filterJump(JUMP_ITEMS, 'digital res').map((i) => i.id)).toEqual(['resume']);
    expect(filterJump(JUMP_ITEMS, 'zzz')).toEqual([]);
  });
  it('opens on Ctrl+K and on "/", but not on "/" typed in a field; Enter goes to the highlighted item', () => {
    const onGo = jest.fn();
    const h = mount(<><input data-testid="field" /><JumpBar onGo={onGo} /></>);
    key('/', {}, h.querySelector('[data-testid="field"]') as HTMLInputElement);
    expect(h.querySelector('[data-testid="cp-jump"]')).toBeNull();
    key('k', { ctrlKey: true });
    const input = h.querySelector('[data-testid="cp-jump-input"]') as HTMLInputElement;
    expect(document.activeElement).toBe(input);
    act(() => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(input, 'offers');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(h.querySelectorAll('[role="option"]')).toHaveLength(1);
    key('Enter', {}, input);
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'offers', go: 'sheet', sheet: 'offers' }));
    expect(h.querySelector('[data-testid="cp-jump"]')).toBeNull();
    key('/');
    expect(h.querySelector('[data-testid="cp-jump"]')).not.toBeNull();
    key('Escape', {}, h.querySelector('[data-testid="cp-jump-input"]') as HTMLInputElement);
    expect(h.querySelector('[data-testid="cp-jump"]')).toBeNull();
  });
  it('the arrow keys move the highlight', () => {
    const onGo = jest.fn();
    const h = mount(<JumpBar onGo={onGo} />);
    key('k', { metaKey: true });
    const input = h.querySelector('[data-testid="cp-jump-input"]') as HTMLInputElement;
    key('ArrowDown', {}, input);
    key('ArrowDown', {}, input);
    key('ArrowUp', {}, input);
    expect(h.querySelector('[aria-selected="true"]')?.id).toBe('cp-jump-progress');
    key('Enter', {}, input);
    expect(onGo).toHaveBeenCalledWith(expect.objectContaining({ id: 'progress', go: 'tab', tab: 'progress' }));
  });
});
