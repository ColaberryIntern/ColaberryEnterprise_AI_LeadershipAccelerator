/**
 * Career Prep v27 (CP5.2, CP5.3): the tower for a student whose Career Prep floor is open, driven through the real
 * useHq. The fixture is a student with an office (a gov project) and Career Prep on: their elevator lights exactly G,
 * their office floor and the Career Prep floor; a ride is EXPRESS (no intermediate floor ever shows on the indicator);
 * the level trail reads step 1 outside, in the lobby and in the elevator, and step 2 on the Career Prep floor;
 * goStart('prep') opens the HQ already on that floor, or the lobby when the badge does not open it.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockOn = true;
let mockMinutes: number | undefined;
jest.mock('../../campusMgmt', () => ({ useCampusMgmt: () => ({ isMgmt: false, label: null, sections: [], canSection: () => false }) }));
jest.mock('../../home/useHomeFacts', () => ({ useHomeFacts: () => ({ firstName: 'Ali', fullName: 'Ali M', initials: 'AM' }) }));
jest.mock('../../../../services/govProjectPortalApi', () => ({ listMyGovProjects: () => Promise.resolve([{ projectId: 'g1', name: 'County RFP', status: 'active' }]) }));
jest.mock('../../../careerPrep/careerPrepFlag', () => ({ fetchCareerPrepFlag: () => Promise.resolve(mockOn), useCareerPrepFlag: () => mockOn }));
jest.mock('../../../careerPrep/careerPrepApi', () => ({ fetchPrepSummary: () => Promise.resolve({ stops: {}, interviews: [], interviewCount: 0, today: '2026-11-16', ...(mockMinutes ? { sessionMinutes: mockMinutes } : {}) }) }));

// eslint-disable-next-line import/first
import { useHq, type HqState } from '../useHq';
// eslint-disable-next-line import/first
import HqBuilding from '../HqBuilding';
// eslint-disable-next-line import/first
import { setHqIntent, START_PREP } from '../hqIntent';
// eslint-disable-next-line import/first
import { prepFloorOf } from '../careerPrepDoors';
// eslint-disable-next-line import/first
import { resetCareerPrepSummaryCache } from '../../../careerPrep/useCareerPrepSummary';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | undefined;
let live: HqState;
function Harness({ reduce }: { reduce: boolean }): React.ReactElement {
  const s = useHq('member', reduce);
  live = s;
  return <HqBuilding s={s} audience="member" face="Staff Office" firstName="Ali" desk={null} named={[]} onGround={() => undefined} reduceMotion={reduce} />;
}
async function render(reduce = true): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => { root = createRoot(container); root.render(<Harness reduce={reduce} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}
beforeEach(() => resetCareerPrepSummaryCache());
afterEach(() => { if (root) act(() => root!.unmount()); root = undefined; container?.remove(); mockOn = true; mockMinutes = undefined; jest.useRealTimers(); });
const $ = (sel: string) => container.querySelector(sel) as HTMLElement;
const $$ = (sel: string) => Array.from(container.querySelectorAll(sel)) as HTMLElement[];
const click = async (el: Element) => { await act(async () => { (el as HTMLElement).click(); }); };
const scene = () => $('[data-testid="cm-hq"]').getAttribute('data-scene');
const step = () => $('[data-testid="cp-trail"]')?.getAttribute('data-step');

describe("a student's tower with Career Prep open (CP5.2, CP5.3)", () => {
  it('the elevator lights exactly G, their office floor and the Career Prep floor (G, 1, 6)', async () => {
    await render();
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    const lit = $$('[data-testid^="cm-hq-fb-"]').filter((b) => !b.classList.contains('lock')).map((b) => b.getAttribute('data-testid')!.replace('cm-hq-fb-', ''));
    expect(lit).toEqual(['6', '1', 'G']);
    expect(prepFloorOf(live.hq.floors)?.num).toBe('6');
  });

  it('the ride is express: from G to 6 the indicator never shows a floor in between', async () => {
    jest.useFakeTimers();
    await render(false);
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    const seen = new Set<string>();
    act(() => live.ride('6'));
    for (let t = 0; t < 2000; t += 20) { act(() => { jest.advanceTimersByTime(20); }); seen.add($('[data-testid="cm-hq-indicator"]')?.textContent ?? live.cabAt); }
    expect([...seen].filter((f) => f !== 'G' && f !== '6')).toEqual([]);
    expect(scene()).toBe('floor');
    expect(live.floor).toBe('6');
  });

  it('the trail: step 1 outside, in the lobby and in the elevator; step 2 on the Career Prep floor', async () => {
    await render();
    expect(step()).toBe('1');
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect(scene()).toBe('lobby');
    expect(step()).toBe('1');
    await click($('[data-testid="cm-hq-call"]'));
    expect(step()).toBe('1');
    await click($('[data-testid="cm-hq-fb-6"]'));
    expect(scene()).toBe('floor');
    expect(step()).toBe('2');
    expect($('[data-testid="cp-trail"] [aria-current="step"]').textContent).toBe('2 Floor 6');
  });

  it('outside and in the lobby: the floor is named, and the express button rides straight there', async () => {
    await render();
    expect($('[data-testid="cm-hq-prep-hint"]').textContent).toBe('Your floor is lit: 6 · Career Prep');
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect($('[data-testid="cm-hq-concierge"]').textContent).toContain('Hi Ali! Career Prep is on Floor 6. Cora, your interview coach, is waiting for you up there.');
    expect($('[data-testid="cm-hq-express"]').textContent).toBe('6 · Go to Career Prep · Elevator A · straight up');
    await click($('[data-testid="cm-hq-express"]'));
    expect(live.floor).toBe('6');
  });

  it('with a session planned for today, the concierge says Cora has it ready (from the student\'s plan)', async () => {
    mockMinutes = 20;
    await render();
    await click($('[data-testid="cm-hq-walk-in"]'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect($('[data-testid="cm-hq-concierge"]').textContent).toContain("Cora, your interview coach, has today's 20-minute session ready.");
  });

  it('the lobby: no badge gate, and the directory lists only their floors plus one line for the staff floors', async () => {
    await render();
    await click($('[data-testid="cm-hq-walk-in"]'));
    expect($('[data-testid="cm-hq-reader"]')).toBeNull();
    const rows = $$('[data-testid="cm-hq-directory"] button .n').map((n) => n.textContent);
    expect(rows).toEqual(['6', '1', 'G']);
    expect($('[data-testid="cm-hq-staff-floors"]').textContent).toBe(`🔒 ${live.hq.floors.length - 2} other floors are Colaberry staff offices.`);
  });

  it('the elevator says the ride is express, and the outside chip names their floor, not an office they may not have', async () => {
    await render();
    expect(container.textContent).toContain('Your badge opens your office + the lobby'); // this student has an office
    await click($('[data-testid="cm-hq-walk-in"]'));
    await click($('[data-testid="cm-hq-call"]'));
    expect($('[data-testid="cm-hq-ride-line"]').textContent).toBe('Tap your floor. It goes straight up, no stops.');
  });

  it("goStart('prep') opens the HQ already on the Career Prep floor", async () => {
    setHqIntent(START_PREP);
    await render();
    expect(scene()).toBe('floor');
    expect(live.floor).toBe('6');
  });

  it("goStart('prep') opens the lobby when the badge does not open Career Prep, with no Career Prep words anywhere", async () => {
    mockOn = false;
    setHqIntent(START_PREP);
    await render();
    expect(scene()).toBe('lobby');
    expect($('[data-testid="cp-trail"]')).toBeNull();
    expect($('[data-testid="cm-hq-express"]')).toBeNull();
    expect(container.textContent).not.toContain('Career Prep');
  });
});
