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
import { TourOffer, UpNext, RoomsHere, tourMinutes } from '../home/NextSteps';
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
    audience: 'member', firstName: 'Ali', buildings, accessOf: () => 'open', workplaceNames: false, presence: null,
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

  it('always offers a next step and the tour, in the v3 order: Up next, the tour, the rooms here (C15)', () => {
    render(concierge({ hereId: 'studio' }));
    const order = ['cm-up-next', 'cm-cc-tour', 'cm-rooms-here'].map((id) => q(id));
    order.forEach((el) => expect(el).not.toBeNull());
    expect(order[0]!.compareDocumentPosition(order[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1]!.compareDocumentPosition(order[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Up next', () => {
  it('names the next unfinished step; Walk there walks to its building, Open now opens it (C15)', () => {
    const walked: string[] = [];
    const opened: string[] = [];
    render(<UpNext stops={STOPS} buildings={buildings} workplaceNames={false} hereId={null} onWalk={(id) => walked.push(id)} onOpen={(r) => opened.push(r)} />);
    expect(q('cm-up-next')!.textContent).toContain('Finish STORY-002');
    expect(q('cm-up-next')!.textContent).toContain('Step 2 of 3');
    act(() => { q('cm-up-next-go')!.click(); });
    act(() => { q('cm-up-next-now')!.click(); });
    expect(walked).toEqual(['studio']);
    expect(opened).toEqual(['/portal/projects/1']);
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

describe('Rooms in the <building> (C15, replaces "Here at")', () => {
  const studio = buildings.find((b) => b.id === 'studio')!;
  it('lists the building\'s rooms, each opening its page', () => {
    const opened: string[] = [];
    render(<RoomsHere building={studio} workplaceNames={false} onOpen={(r) => opened.push(r)} />);
    expect(q('cm-rooms-here')!.textContent).toContain('Rooms in Project Studio'); // the business district takes no article, as the kicker
    act(() => { (container.querySelector('[data-testid="cm-rooms-here-room"]') as HTMLButtonElement).click(); });
    expect(opened).toEqual([studio.rooms.filter((r) => !r.planned)[0].route]);
  });

  it('at the gate, or outside every building, nothing', () => {
    render(<RoomsHere building={buildings.find((b) => b.id === 'gate') ?? null} workplaceNames={false} onOpen={() => undefined} />);
    expect(q('cm-rooms-here')).toBeNull();
    render(<RoomsHere building={null} workplaceNames={false} onOpen={() => undefined} />);
    expect(q('cm-rooms-here')).toBeNull();
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

describe('C15 (v3 2.6): each fact once', () => {
  const titleCount = (title: string, outsidePlan = true) => Array.from(container.querySelectorAll('b, .t, span'))
    // the phone peek strip is the panel's collapsed form (shown INSTEAD of the body while a card is open), so it is not a repeat
    .filter((el) => el.children.length === 0 && el.textContent === title && !el.closest('[data-testid="cm-cc-peek"]')
      && (!outsidePlan || !el.closest('[data-testid="cm-cc-plan"]'))).length;

  it('the Up next step appears once outside the plan list, and the plan tags it UP NEXT instead of repeating it', () => {
    render(concierge({ hereId: 'lecture', agenda: null }));
    expect(titleCount('Finish STORY-002')).toBe(1);
    expect(q('cm-plan-upnext')!.closest('li')!.textContent).toContain('Finish STORY-002');
    expect(container.querySelectorAll('[data-testid="cm-plan-upnext"]').length).toBe(1);
    expect(q('cm-here-at')).toBeNull();
  });

  it('in the step\'s building: Open the card + Mark done, through the same completion as the arrival card', async () => {
    const done: string[] = [];
    const stops = STOPS.map((s) => (s.key === 'b' ? { ...s, cardId: 'card-1' } : s));
    render(concierge({ stops, hereId: 'studio', onDone: async (s) => { done.push(s.key); return { ok: true, points: 10 } as never; } }));
    expect(q('cm-up-next-open')!.textContent).toContain('Open the card');
    await act(async () => { q('cm-up-next-done')!.click(); });
    expect(done).toEqual(['b']);
  });

  it('a refused Mark done shows the server\'s reason and ticks nothing', async () => {
    const stops = STOPS.map((s) => (s.key === 'b' ? { ...s, cardId: 'card-1' } : s));
    render(concierge({ stops, hereId: 'studio', onDone: async () => ({ ok: false, reason: 'gate', message: 'Watch 75% first' }) as never }));
    await act(async () => { q('cm-up-next-done')!.click(); });
    expect(q('cm-up-next-why')!.textContent).toBe('Watch 75% first');
  });

  it('the urgent card takes the Up next slot', () => {
    render(concierge({ urgent: { buildingId: 'lecture', title: 'Build Day', detail: 'starts in 10 min', route: '/portal/sessions' } as never }));
    expect(q('cm-up-next')).toBeNull();
  });

  it('rooms in the building only while you are in one', () => {
    render(concierge({ hereId: null }));
    expect(q('cm-rooms-here')).toBeNull();
    render(concierge({ hereId: 'library' }));
    expect(q('cm-rooms-here')).not.toBeNull();
  });
});
