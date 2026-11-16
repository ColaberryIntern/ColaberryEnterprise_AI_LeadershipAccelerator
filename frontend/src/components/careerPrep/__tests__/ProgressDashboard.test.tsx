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
  it('with no data: still visual and honest (a ring toward the first score, empty trend, real zero counts), invents nothing', () => {
    const h = mount(empty);
    expect(h.querySelector('[data-testid="cp-readiness-empty"]')).not.toBeNull();
    expect(h.querySelector('[data-testid="cp-readiness"]')).toBeNull();
    expect(h.querySelector('[data-testid="cp-progress-ring"]')?.getAttribute('aria-label')).toBe('0 of 5 skills scored');
    expect(h.querySelector('[data-testid="cp-trend-empty"]')).not.toBeNull();
    expect(h.textContent).not.toMatch(/\b0 ?\/ ?100\b/);
    expect(h.textContent).not.toContain("Cora's read");
    expect(h.querySelectorAll('[data-testid="cp-tiles"] li')).toHaveLength(5);
    expect(h.textContent).toContain('no streak yet');
    expect(h.textContent).toContain('No practice minutes yet');
  });

  it('skills without enough practice are empty gray bars that say so, never a 0', () => {
    const h = mount({ ...empty, skills: [{ key: 'w', label: 'Proof of work', count: 1, sources: ['project'] }, { key: 'x', label: 'Answer structure', count: 0, sources: [] }] });
    const row = h.querySelector('[data-testid="cp-skill-w"]') as HTMLElement;
    expect(row.querySelector('.cp-bar.is-empty')).not.toBeNull();
    expect(row.querySelector('.cp-skill-v')).toBeNull();
    expect(row.textContent).toContain('not enough practice yet · 1 of 3');
    expect(h.querySelector('[data-testid="cp-skill-x"]')?.textContent).toContain('not enough practice yet');
  });

  it('with data: readiness, its change, the trend with the ready line, interviews, skills lowest first, sources and practice', () => {
    const h = mount(full);
    expect(h.querySelector('[data-testid="cp-readiness"] b')?.textContent).toBe('64');
    expect(h.querySelector('[data-testid="cp-readiness-change"]')?.textContent).toBe('up 9 since Nov 2');
    expect(h.querySelector('[data-testid="cp-trend-svg"] .cp-ready')).not.toBeNull();
    expect(h.querySelector('[data-testid="cp-trend-svg"]')?.textContent).toContain('75 · ready');
    expect(Array.from(h.querySelectorAll('[data-testid="cp-skills"] .cp-skill-name')).map((e) => e.textContent)).toEqual(['Pace and clarity', 'Few filler words', 'Role knowledge', 'Proof of work']);
    expect(h.querySelector('[data-testid="cp-skill-p"] .cp-delta.down')?.textContent).toBe('down 2');
    expect(h.querySelector('[data-testid="cp-skill-f"] .cp-delta.up')?.textContent).toBe('up 9');
    expect(h.querySelector('[data-testid="cp-skill-w"]')?.textContent).toContain('not enough practice yet');
    expect(Array.from(h.querySelectorAll('[data-testid="cp-tiles"] li')).map((t) => t.textContent)).toEqual(['4video answers scored', '0phone mocks with Cora', '0real interviews recorded', '2training lessons done', '0projects verified']);
    expect(h.textContent).toContain('Minutes per week · 3-day streak');
    expect(h.querySelector('[data-testid="cp-weekly-svg"]')).not.toBeNull();
  });

  it('a partial payload (skills, no readiness, no interviews) shows only what exists', () => {
    const h = mount({ ...empty, skills: full.skills });
    expect(h.querySelector('[data-testid="cp-readiness-empty"]')).not.toBeNull();
    expect(h.querySelector('[data-testid="cp-progress-ring"]')?.getAttribute('aria-label')).toBe('3 of 5 skills scored');
    expect(h.querySelector('[data-testid^="cp-iv-"]')).toBeNull();
    expect(h.querySelectorAll('[data-testid="cp-skills"] li')).toHaveLength(4);
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
    act(() => (h.querySelector('[data-testid="cp-iv-i1"]') as HTMLButtonElement).click());
    expect(onAnchor).toHaveBeenCalledWith('i1');
    act(() => (h.querySelector('[data-testid="cp-skills"] .cp-rowbtn') as HTMLButtonElement).click());
    expect(onSkill).toHaveBeenCalledWith(expect.objectContaining({ key: 'p' }));
  });

  it("Cora's read is the three lowest scored skills, with their evidence", () => {
    expect(coraRead(full.skills).map((s) => s.key)).toEqual(['p', 'f', 'r']);
    expect(mount(full).querySelector('.cp-read li')?.textContent).toBe('Pace and clarity41 · from 4 results (video)Make me a plan for this');
  });

  it('never uses status colors for a chart series', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'careerPrepRoom.css'), 'utf8');
    const series = css.match(/\.cp-series\{[^}]*\}|\.cp-bar-rect\{[^}]*\}|\.cp-dotpt\{[^}]*\}/g) ?? [];
    expect(series).toHaveLength(3);
    for (const rule of series) expect(rule).toContain('var(--accent)');
  });
});
