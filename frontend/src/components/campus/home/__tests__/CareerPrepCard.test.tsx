import React from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { PrepInterview, PrepSummary } from '../../../careerPrep/careerPrepApi';
import { prepCardCopy } from '../../../careerPrep/logic/prepCardCopy';
import { CareerPrepCard, CareerPrepCardView } from '../CareerPrepCard';
import { useCareerPrepFlag } from '../../../careerPrep/careerPrepFlag';
import { useCareerPrepSummary } from '../../../careerPrep/useCareerPrepSummary';

jest.mock('../../../careerPrep/careerPrepFlag', () => ({ useCareerPrepFlag: jest.fn() }));
jest.mock('../../../careerPrep/useCareerPrepSummary', () => ({ useCareerPrepSummary: jest.fn() }));
const flag = useCareerPrepFlag as jest.Mock;
const summary = useCareerPrepSummary as jest.Mock;

const MON = new Date('2026-11-16T18:00:00Z'); // Monday noon Central
const iv = (o: Partial<PrepInterview>): PrepInterview => ({ id: 'i1', source: 'real', company: 'Meridian Freight', role: 'AI Engineer', type: 'technical', target: 75, ...o });
const sum = (o: Partial<PrepSummary>): PrepSummary => ({ stops: {}, interviews: [], today: '2026-11-16', ...o });
const inDays = (d: number, hourUtc = 20) => new Date(Date.UTC(2026, 10, 16 + d, hourUtc)).toISOString();

describe('prepCardCopy: the headline, by rule (CP5.1)', () => {
  it('an interview within 7 days names its weekday in Central', () => {
    expect(prepCardCopy(sum({ interviews: [iv({ startsAt: inDays(3) })] }), MON).headline).toBe("Get ready for Thursday's interview");
  });
  it('a later interview names the company', () => {
    expect(prepCardCopy(sum({ interviews: [iv({ startsAt: inDays(10) })] }), MON).headline).toBe('Get ready for your Meridian Freight interview');
  });
  it('a practice interview only: keep practicing for the role', () => {
    expect(prepCardCopy(sum({ nextInterview: iv({ id: 'p1', source: 'practice', role: 'Data Analyst' }) }), MON).headline).toBe('Keep practicing for Data Analyst');
  });
  it('nothing: get ready for your next interview, and paste a job description to start', () => {
    const c = prepCardCopy(sum({}), MON);
    expect(c.headline).toBe('Get ready for your next interview');
    expect(c.coraLine).toBe('Paste a job description to start.');
    expect(c.rows).toEqual([]);
  });
  it('precedence: a dated interview beats a practice one, and the soonest decides', () => {
    const s = sum({ nextInterview: iv({ id: 'p1', source: 'practice', role: 'Data Analyst' }), interviews: [iv({ id: 'b', company: 'Later Co', startsAt: inDays(12) }), iv({ id: 'a', startsAt: inDays(2) })] });
    expect(prepCardCopy(s, MON).headline).toBe("Get ready for Wednesday's interview");
  });
  it('the weekday is Central across DST: 11:30 PM CST Saturday is Saturday, not Sunday (UTC)', () => {
    const sat = sum({ interviews: [iv({ startsAt: '2026-11-22T05:30:00.000Z' })] }); // Sat 21 Nov 11:30 PM CST
    expect(prepCardCopy(sat, MON).headline).toBe("Get ready for Saturday's interview");
    const summer = sum({ interviews: [iv({ startsAt: '2026-07-04T04:30:00.000Z' })] }); // Fri 3 Jul 11:30 PM CDT
    expect(prepCardCopy(summer, new Date('2026-07-01T17:00:00Z')).headline).toBe("Get ready for Friday's interview");
  });
});

describe('prepCardCopy: the rows (CP5.1)', () => {
  const four = [iv({ id: 'c', startsAt: inDays(6), source: 'added', readiness: 70 }), iv({ id: 'a', startsAt: inDays(1), readiness: 64 }), iv({ id: 'b', startsAt: inDays(3) }), iv({ id: 'old', startsAt: inDays(-1) })];
  it('soonest first, at most 2, past interviews left out, "+n more" from the full count', () => {
    const c = prepCardCopy(sum({ interviews: four, interviewCount: 4 }), MON);
    expect(c.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(c.more).toBe(2);
    expect(c.rows[0]).toEqual({ id: 'a', title: 'Meridian Freight · AI Engineer', when: 'Tuesday at 2:00 PM CT', readiness: 64, target: 75, tag: 'Real interview' });
  });
  it('a readiness the server does not have is left out, never 0', () => {
    const c = prepCardCopy(sum({ interviews: [iv({ id: 'b', startsAt: inDays(3) })] }), MON);
    expect(c.rows[0]).not.toHaveProperty('readiness');
    expect(c.more).toBe(0);
  });
  it("Cora's line names today's planned minutes when there is a plan for today", () => {
    expect(prepCardCopy(sum({ interviews: [iv({ startsAt: inDays(1) })], sessionMinutes: 20 }), MON).coraLine).toBe("Today's plan: a 20-minute session with Cora.");
    expect(prepCardCopy(sum({ interviews: [iv({ startsAt: inDays(1) })] }), MON).coraLine).toBe('Ask Cora for a plan when you are ready.');
  });
});

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
function Where(): React.ReactElement { const l = useLocation(); return <span data-testid="where">{l.pathname + l.search}</span>; }

describe('CareerPrepCard (CP5.1)', () => {
  beforeEach(() => { flag.mockReset().mockReturnValue(true); summary.mockReset().mockReturnValue(sum({ interviews: [iv({ startsAt: inDays(1), readiness: 64 })], interviewCount: 1, sessionMinutes: 20 })); });

  it('a student with Career Prep open sees the card, with the floor number from the built floor', () => {
    const h = mount(<MemoryRouter><CareerPrepCard audience="member" now={MON} /></MemoryRouter>);
    expect(h.querySelector('[data-testid="cm-prep-card"] h2')?.textContent).toBe("Get ready for Tuesday's interview");
    expect(h.querySelector('.cm-prep-floor b')?.textContent).toMatch(/^\d+$/);
    expect(h.querySelector('.cm-prep-bar')?.getAttribute('aria-label')).toBe('Readiness 64, ready at 75');
  });
  it.each(['explorer', 'business', 'staff'] as const)('hidden for %s, and the summary is never asked for', (audience) => {
    const h = mount(<MemoryRouter><CareerPrepCard audience={audience} now={MON} /></MemoryRouter>);
    expect(h.querySelector('[data-testid="cm-prep-card"]')).toBeNull();
    expect(summary).toHaveBeenCalledWith(false);
  });
  it('hidden for a student Career Prep is not open for, and while the flag or summary is loading', () => {
    flag.mockReturnValue(false);
    expect(mount(<MemoryRouter><CareerPrepCard audience="member" now={MON} /></MemoryRouter>).querySelector('[data-testid="cm-prep-card"]')).toBeNull();
    act(() => root!.unmount()); root = null; host?.remove();
    flag.mockReturnValue(true); summary.mockReturnValue(undefined);
    expect(mount(<MemoryRouter><CareerPrepCard audience="member" now={MON} /></MemoryRouter>).querySelector('[data-testid="cm-prep-card"]')).toBeNull();
  });
  it('an interview row opens the room anchored on it; Go opens Career Prep', () => {
    const h = mount(<MemoryRouter><CareerPrepCard audience="member" now={MON} /><Where /></MemoryRouter>);
    act(() => (h.querySelector('[data-testid="cm-prep-row-i1"]') as HTMLButtonElement).click());
    expect(h.querySelector('[data-testid="where"]')?.textContent).toBe('/portal/career/room?anchor=i1');
    act(() => (h.querySelector('[data-testid="cm-prep-go"]') as HTMLButtonElement).click());
    expect(h.querySelector('[data-testid="where"]')?.textContent).toBe('/portal/career/room');
  });
  it('when the summary failed, the card still offers Go with the generic headline and no made-up rows', () => {
    const h = mount(<CareerPrepCardView s={null} now={MON} floor="6" onGo={jest.fn()} onInterview={jest.fn()} />);
    expect(h.querySelector('h2')?.textContent).toBe('Get ready for your next interview');
    expect(h.querySelector('.cm-prep-rows')).toBeNull();
    expect(h.querySelector('[data-testid="cm-prep-go"]')).not.toBeNull();
  });
});
