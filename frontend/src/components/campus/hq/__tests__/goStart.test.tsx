import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

/**
 * Career Prep v27 (CP5.2): goStart('prep'). On the campus it records the START_PREP intent and opens the HQ building
 * (the HQ then rides to the Career Prep floor, tested in hqCareerPrepTower). Off the campus it goes to /portal/career.
 * The campus card's Go button is goStart('prep').
 */
let mockEnabled = true;
const mockOpenMap = jest.fn();
jest.mock('../../CampusContext', () => ({ useCampus: () => ({ enabled: mockEnabled, openMap: mockOpenMap }) }));
jest.mock('../../../careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: () => true }));
jest.mock('../../../careerPrep/useCareerPrepSummary', () => ({ useCareerPrepSummary: () => ({ stops: {}, interviews: [], interviewCount: 0, today: '2026-11-16' }) }));

// eslint-disable-next-line import/first
import { CareerPrepCard } from '../../home/CareerPrepCard';
// eslint-disable-next-line import/first
import { START_PREP, takeHqIntent } from '../hqIntent';

let host: HTMLDivElement | null = null;
let root: Root | null = null;
function Where(): React.ReactElement { const l = useLocation(); return <span data-testid="where">{l.pathname}</span>; }
function mount(): HTMLDivElement {
  const h = document.createElement('div');
  document.body.appendChild(h);
  const r = createRoot(h);
  host = h; root = r;
  act(() => { r.render(<MemoryRouter initialEntries={['/portal']}><CareerPrepCard audience="member" now={new Date('2026-11-16T18:00:00Z')} /><Where /></MemoryRouter>); });
  return h;
}
beforeEach(() => { mockEnabled = true; mockOpenMap.mockReset(); takeHqIntent(); });
afterEach(() => { if (root) { const r = root; act(() => r.unmount()); } host?.remove(); host = null; root = null; });

describe("goStart('prep') from the campus card (CP5.2)", () => {
  it('on the campus: records the prep start intent and opens the HQ building; the page does not change', () => {
    const h = mount();
    act(() => (h.querySelector('[data-testid="cm-prep-go"]') as HTMLButtonElement).click());
    expect(mockOpenMap).toHaveBeenCalledWith('career');
    expect(takeHqIntent()).toBe(START_PREP);
    expect(h.querySelector('[data-testid="where"]')?.textContent).toBe('/portal');
  });

  it('off the campus: goes to the /portal/career floor and leaves no intent behind', () => {
    mockEnabled = false;
    const h = mount();
    act(() => (h.querySelector('[data-testid="cm-prep-go"]') as HTMLButtonElement).click());
    expect(mockOpenMap).not.toHaveBeenCalled();
    expect(takeHqIntent()).toBeNull();
    expect(h.querySelector('[data-testid="where"]')?.textContent).toBe('/portal/career');
  });

  it('the level trail loads its own styles, so it is styled on the /portal/career page too', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'careerPrep', 'LevelTrail.tsx'), 'utf8');
    expect(src).toContain("import './levelTrail.css';");
    const css = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'careerPrep', 'levelTrail.css'), 'utf8');
    expect(css).toMatch(/\.cp-trail\{display:flex/);
    expect(css).toMatch(/\.cp-trail li\[aria-current\]\{/);
  });
});
