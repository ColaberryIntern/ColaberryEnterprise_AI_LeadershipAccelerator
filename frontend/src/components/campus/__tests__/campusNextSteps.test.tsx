/**
 * WP-1, owner rule: there is always a side panel with your next steps and the tours.
 *  - the concierge is never hidden (no `hidden`, no tuck class), with a card open it only gets `has-card` (a peek strip on phones);
 *  - Up next names the next unfinished plan step: Go walks there, Open when you are already in its building;
 *  - Here at <building> carries that building's main action, your plan step there and the tour stop;
 *  - the tour card has its three states: offer (real stop count), in progress / Resume at the paused stop, and taken (again).
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CampusConcierge from '../home/CampusConcierge';
import type { ConciergeProps } from '../home/CampusConcierge';
import { TourOffer, UpNext, HereAt, tourMinutes } from '../home/NextSteps';
import { CAMPUS_BUILDINGS } from '../campusMap';
import type { BuildingId } from '../campusMap';
import type { PlanStop } from '../campusPlan';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = (el: React.ReactElement) => act(() => { root.render(el); });
const q = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
const buildings = [...CAMPUS_BUILDINGS];
const stop = (o: Partial<PlanStop> & Pick<PlanStop, 'key' | 'title' | 'route' | 'buildingId' | 'done'>): PlanStop =>
  ({ type: 'deep_dive', label: 'Deep Dive', minutes: null, points: 0, ref: null, cardId: null, ...o });
const STOPS: PlanStop[] = [
  stop({ key: 'a', title: 'Watch the agents lesson', route: '/portal/classroom', buildingId: 'lecture', done: true }),
  stop({ key: 'b', title: 'Finish STORY-002', route: '/portal/projects/1', buildingId: 'studio', done: false }),
  stop({ key: 'c', title: 'Knowledge check', route: '/portal/cert-prep', buildingId: 'testing', done: false }),
];
const TOUR = ['lecture', 'library', 'studio', 'testing', 'observatory', 'commons', 'gallery', 'career', 'arcade'].map((id) => ({ buildingId: id as BuildingId }));

function concierge(over: Partial<ConciergeProps> = {}): React.ReactElement {
  const p: ConciergeProps = {
    audience: 'member', firstName: 'Ali', hereName: 'main gate', buildings, accessOf: () => 'open', workplaceNames: false, presence: null,
    presenceError: false, desks: [], stops: STOPS, live: null, now: new Date('2026-10-22T15:00:00Z'), tourStops: TOUR, touring: null,
    tourProgress: { paused: null, toured: false }, onWalk: () => undefined, onTour: () => undefined, onOpen: () => undefined, ...over,
  };
  return <CampusConcierge {...p} />;
}

describe('the side panel is never hidden', () => {
  it('with a card open it stays in the document, visible, with has-card (never hidden or tucked)', () => {
    render(concierge({ cardOpen: true }));
    const cc = q('cm-concierge')!;
    expect(cc.hasAttribute('hidden')).toBe(false);
    expect(cc.className).not.toMatch(/tucked/);
    expect(cc.className).toContain('has-card');
    expect(q('cm-cc-peek')!.textContent).toContain('Finish STORY-002');
  });

  it('always offers a next step and the tour, in the prompt order: Up next, Here at, the tour', () => {
    render(concierge({ hereId: 'studio', hereName: 'Project Studio' }));
    const order = ['cm-up-next', 'cm-here-at', 'cm-cc-tour'].map((id) => q(id));
    order.forEach((el) => expect(el).not.toBeNull());
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Up next', () => {
  it('names the next unfinished step and Go walks to its building', () => {
    const walked: string[] = [];
    render(<UpNext stops={STOPS} buildings={buildings} workplaceNames={false} hereId={null} onWalk={(id) => walked.push(id)} onOpen={() => undefined} />);
    expect(q('cm-up-next')!.textContent).toContain('Finish STORY-002');
    expect(q('cm-up-next')!.textContent).toContain('Step 2 of 3');
    act(() => { q('cm-up-next-go')!.click(); });
    expect(walked).toEqual(['studio']);
  });

  it('already in that building: Open goes straight to the step', () => {
    const opened: string[] = [];
    render(<UpNext stops={STOPS} buildings={buildings} workplaceNames={false} hereId="studio" onWalk={() => undefined} onOpen={(r) => opened.push(r)} />);
    act(() => { q('cm-up-next-open')!.click(); });
    expect(opened).toEqual(['/portal/projects/1']);
  });

  it('nothing left (or no plan): not drawn', () => {
    render(<UpNext stops={STOPS.map((s) => ({ ...s, done: true }))} buildings={buildings} workplaceNames={false} hereId={null} onWalk={() => undefined} onOpen={() => undefined} />);
    expect(q('cm-up-next')).toBeNull();
    render(<UpNext stops={null} buildings={buildings} workplaceNames={false} hereId={null} onWalk={() => undefined} onOpen={() => undefined} />);
    expect(q('cm-up-next')).toBeNull();
  });
});

describe('Here at <building>', () => {
  const studio = buildings.find((b) => b.id === 'studio')!;
  it('the building main action, your plan step there and the tour stop', () => {
    const opened: string[] = [];
    render(<HereAt building={studio} workplaceNames={false} stops={STOPS} tourStop={{ n: 3, of: 9 }} onOpen={(r) => opened.push(r)} />);
    expect(q('cm-here-at')!.textContent).toContain('Here at Project Studio');
    expect(q('cm-here-tour')!.textContent).toBe('Tour stop 3 of 9');
    act(() => { q('cm-here-step')!.click(); });
    act(() => { q('cm-here-cta')!.click(); });
    expect(opened).toEqual(['/portal/projects/1', studio.primary.route]);
  });

  it('at the gate, nothing', () => {
    render(<HereAt building={buildings.find((b) => b.id === 'gate') ?? null} workplaceNames={false} stops={STOPS} tourStop={null} onOpen={() => undefined} />);
    expect(q('cm-here-at')).toBeNull();
  });
});

describe('the tour card, three states', () => {
  const offer = (over: Partial<React.ComponentProps<typeof TourOffer>> = {}) => (
    <TourOffer audience="member" stops={TOUR} buildings={buildings} workplaceNames={false} running={null} paused={null} toured={false} onStart={() => undefined} {...over} />
  );

  it('offer: the real stop count and minutes, Take the tour starts at stop 1', () => {
    const started: number[] = [];
    render(offer({ onStart: (i) => started.push(i) }));
    expect(q('cm-cc-tour')!.getAttribute('data-state')).toBe('idle');
    expect(q('cm-cc-tour')!.textContent).toContain(`A ${tourMinutes(9)}-minute walk through the 9 places your enrollment unlocks`);
    act(() => { q('cm-cc-tour-start')!.click(); });
    expect(started).toEqual([0]);
  });

  it('paused: "Stop n of 9 · building" and Resume starts there', () => {
    const started: number[] = [];
    render(offer({ paused: 3, onStart: (i) => started.push(i) }));
    expect(q('cm-cc-tour')!.getAttribute('data-state')).toBe('paused');
    expect(q('cm-cc-tour')!.textContent).toContain('Stop 4 of 9');
    act(() => { q('cm-cc-tour-resume')!.click(); });
    expect(started).toEqual([3]);
  });

  it('running: in progress with End tour', () => {
    const ended: string[] = [];
    render(offer({ running: 1, onEnd: () => ended.push('end') }));
    expect(q('cm-cc-tour')!.getAttribute('data-state')).toBe('running');
    act(() => { q('cm-cc-tour-end')!.click(); });
    expect(ended).toEqual(['end']);
  });

  it('taken: "seen everything" and take the tour again', () => {
    const started: number[] = [];
    render(offer({ toured: true, onStart: (i) => started.push(i) }));
    expect(q('cm-cc-tour')!.textContent).toContain('seen everything in your seat');
    act(() => { q('cm-cc-tour-again')!.click(); });
    expect(started).toEqual([0]);
  });

  it('per account: Explorer and partner wording; staff (no tour) get no card', () => {
    render(offer({ audience: 'explorer', stops: TOUR.slice(0, 7) }));
    expect(q('cm-cc-tour')!.textContent).toContain('7 stops');
    render(offer({ audience: 'business', stops: TOUR.slice(0, 6) }));
    expect(q('cm-cc-tour')!.textContent).toContain('Start the partner tour');
    render(offer({ audience: 'staff', stops: null }));
    expect(q('cm-cc-tour')).toBeNull();
  });
});
