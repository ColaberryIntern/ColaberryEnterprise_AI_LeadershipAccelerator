import React from 'react';
import fs from 'fs';
import path from 'path';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { ProgressDashboard, coraRead } from '../ProgressDashboard';
import type { PrepDashboard } from '../careerPrepApi';

const empty: PrepDashboard = { interviews: [], skills: [], sources: { video: 0, phone_mock: 0, real_interview: 0, training: 0, project: 0 }, weeklyMinutes: [], streak: 0, thisWeek: 0 };
const full: PrepDashboard = {
  anchorId: 'i1',
  readiness: { value: 64, target: 75, changeSinceFirst: 9, trend: [{ week: '2026-11-02', value: 55 }, { week: '2026-11-09', value: 60 }, { week: '2026-11-16', value: 64 }] },
  interviews: [{ id: 'i1', source: 'real', company: 'Acme', role: 'AI Engineer', type: 'technical', startsAt: '2026-11-19T20:00:00Z', readiness: 64, target: 75 }],
  skills: [
    { key: 'p', label: 'Pace and clarity', score: 41, change30: -2, count: 4, sources: ['video'] },
    { key: 'f', label: 'Few filler words', score: 48, change30: 9, count: 5, sources: ['video'] },
    { key: 'r', label: 'Role knowledge', score: 80, count: 3, sources: ['training'] },
    { key: 'w', label: 'Proof of work', count: 0, sources: [] },
  ],
  sources: { video: 4, phone_mock: 0, real_interview: 0, training: 2, project: 0 },
  weeklyMinutes: [{ week: '2026-11-09', minutes: 0 }, { week: '2026-11-16', minutes: 40 }],
  streak: 3, thisWeek: 40,
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function mount(d: PrepDashboard, onAnchor = jest.fn(), onSkill = jest.fn()): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(<ProgressDashboard d={d} onAnchor={onAnchor} onSkill={onSkill} />); });
  return h;
}
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });

describe('Your progress (CP3.5)', () => {
  it('with no data shows what to do first and invents nothing', () => {
    const h = mount(empty);
    expect(h.querySelector('[data-testid="cp-readiness-empty"]')).not.toBeNull();
    expect(h.querySelector('[data-testid="cp-readiness"]')).toBeNull();
    expect(h.textContent).not.toMatch(/\b0 \/ 100\b/);
    expect(h.textContent).not.toContain("Cora's read");
    expect(h.textContent).not.toContain('Where the data comes from');
    expect(h.textContent).not.toContain('Practice over time');
  });

  it('with data: readiness, its trend with the ready line, interviews, skills lowest first, sources and practice', () => {
    const h = mount(full);
    expect(h.querySelector('[data-testid="cp-readiness"]')?.textContent).toContain('64 / 100');
    expect(h.textContent).toContain('up 9 since your first week');
    expect(h.querySelector('.cp-ready')).not.toBeNull();
    expect(Array.from(h.querySelectorAll('[data-testid="cp-skills"] .cp-skill-name')).map((e) => e.textContent)).toEqual(['Pace and clarity', 'Few filler words', 'Role knowledge']);
    expect(h.textContent).toContain('Not enough data yet: Proof of work.');
    expect(h.textContent).toContain('4 video answers scored');
    expect(h.textContent).not.toContain('phone mocks');
    expect(h.textContent).toContain('Streak: 3 days');
  });

  it('a partial payload (skills, no readiness, no interviews) shows only what exists', () => {
    const h = mount({ ...empty, skills: full.skills });
    expect(h.querySelector('[data-testid="cp-readiness-empty"]')).not.toBeNull();
    expect(h.textContent).not.toContain('Your interviews');
    expect(h.querySelectorAll('[data-testid="cp-skills"] li')).toHaveLength(3);
    expect(h.textContent).toContain("Cora's read");
  });

  it('each interview shows its readiness bar with a tick at its ready mark', () => {
    const h = mount(full);
    const tick = h.querySelector('[data-testid="cp-iv-i1"] .cp-bar-tick') as HTMLElement;
    expect(tick.style.left).toBe('75%');
  });

  it('a focused chart point shows its value in a readout, for keyboard users', () => {
    const h = mount(full);
    const dot = h.querySelector('.cp-dotpt') as SVGCircleElement;
    act(() => { dot.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); });
    expect(h.querySelector('[data-testid="cp-chart-readout"]')?.textContent).toBe('Nov 2: 55 readiness');
  });

  it('every chart can show its data as a table', () => {
    const h = mount(full);
    const toggles = Array.from(h.querySelectorAll('.cp-chart figcaption button')) as HTMLButtonElement[];
    expect(toggles).toHaveLength(2);
    act(() => toggles[0].click());
    expect(Array.from(h.querySelectorAll('.cp-table td')).map((c) => c.textContent)).toContain('64');
    act(() => toggles[1].click());
    expect(Array.from(h.querySelectorAll('.cp-table td')).map((c) => c.textContent)).toContain('40');
  });

  it('interview rows anchor, skill rows ask for a short session', () => {
    const onAnchor = jest.fn();
    const onSkill = jest.fn();
    const h = mount(full, onAnchor, onSkill);
    act(() => (Array.from(h.querySelectorAll('.cp-rowbtn')).find((b) => b.textContent?.includes('Acme')) as HTMLButtonElement).click());
    expect(onAnchor).toHaveBeenCalledWith('i1');
    act(() => (h.querySelector('[data-testid="cp-skills"] .cp-rowbtn') as HTMLButtonElement).click());
    expect(onSkill).toHaveBeenCalledWith(expect.objectContaining({ key: 'p' }));
  });

  it("Cora's read is the three lowest scored skills, with their evidence", () => {
    expect(coraRead(full.skills).map((s) => s.key)).toEqual(['p', 'f', 'r']);
    expect(mount(full).textContent).toContain('Pace and clarity is at 41, from 4 observations (video).');
  });

  it('never uses status colors for a chart series', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'careerPrepRoom.css'), 'utf8');
    const series = css.match(/\.cp-series\{[^}]*\}|\.cp-bar-rect\{[^}]*\}|\.cp-dotpt\{[^}]*\}/g) ?? [];
    expect(series).toHaveLength(3);
    for (const rule of series) expect(rule).toContain('var(--accent)');
  });
});
