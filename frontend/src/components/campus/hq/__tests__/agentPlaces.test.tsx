/**
 * C87 agent places, on the client, and C119 (Ali 2026-11-06: "I see Dara on the curriculum floor, but I have no way of
 * communicating with her. Maybe she should be in the lobby of Floor 4."): an AI agent whose place is a Staff Office floor stands
 * at that floor's FRONT DESK in its lobby (Dara on the Program floor), pressable, opening her staff card (Message Dara + her
 * prompts), and is no longer a face on the Curriculum door. Only a staff badge that opens that floor sees her: the server sends
 * her desk only to that badge, and floorAgents never widens it. The staff card still names the floor.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { buildHq, floorAgents, placePeople } from '../hqModel';
import { FloorLobbyDesks } from '../FloorLobbyDesk';
import { deskPlace } from '../../StaffPop';
import { CAMPUS_BUILDINGS } from '../../campusMap';
import { onStaffCard } from '../../staffCard';
import type { StaffDesk } from '../../campusPeopleApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const desk = (over: Partial<StaffDesk>): StaffDesk => ({
  id: 'dara', name: 'Dara', title: 'Curriculum desk', building: 'career', floor: 'program', office: '/admin/orchestration',
  ai: true, on_duty: true, enrollment_id: 'dara-1', opens: null, prompts: ['Which lessons are students stalling on this week?'], ...over,
});
const career = CAMPUS_BUILDINGS.find((b) => b.id === 'career');
const reese = desk({ id: 'reese', name: 'Reese', title: 'Mentor desk', building: 'lecture', floor: null, office: null });
const programOf = (hq: ReturnType<typeof buildHq>) => hq.floors.find((f) => f.label === 'Program')!;

describe('floorAgents', () => {
  it('a staff badge that opens the Program floor finds Dara at its front desk, and only there', () => {
    const hq = buildHq(() => true, true, 'staff');
    const program = programOf(hq);
    expect(floorAgents(hq, program, [desk({}), reese]).map((d) => d.id)).toEqual(['dara']);
    for (const f of hq.floors.filter((x) => x !== program)) expect(floorAgents(hq, f, [desk({})])).toEqual([]);
  });

  it('never widens the gate: a badge that does not open the floor, a learner, an off-duty desk or no desks find nobody', () => {
    const closed = buildHq((s) => s !== 'program', true, 'staff'); // the floor may still open other rooms, never Curriculum
    expect(floorAgents(closed, programOf(closed), [desk({})])).toEqual([]);
    const none = buildHq(() => false, true, 'staff');
    expect(floorAgents(none, programOf(none), [desk({})])).toEqual([]);
    const learner = buildHq(() => false, false, 'member');
    expect(floorAgents(learner, programOf(learner), [desk({})])).toEqual([]);
    const hq = buildHq(() => true, true, 'staff');
    expect(floorAgents(hq, programOf(hq), [desk({ on_duty: false })])).toEqual([]);
    expect(floorAgents(hq, programOf(hq), null)).toEqual([]);
    expect(floorAgents(hq, programOf(hq), [desk({ office: '/admin/not-a-page' })])).toEqual([]);
  });

  it('Dara is no longer a face on the Curriculum door (placePeople only places the people sent by presence)', () => {
    const hq = buildHq(() => true, true, 'staff');
    expect(placePeople(hq, []).byRoom.get('/admin/orchestration')).toBeUndefined();
  });
});

describe('the front desk', () => {
  let container: HTMLDivElement;
  let root: Root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows Dara with her role and opens her staff card (the same card as Reese\'s mentor desk) when pressed', () => {
    const opened: string[] = [];
    const off = onStaffCard((r) => opened.push(r.id));
    act(() => { root.render(<FloorLobbyDesks desks={[desk({})]} variant="scene" />); });
    const btn = container.querySelector<HTMLButtonElement>('[data-testid="cm-hq-fdesk-scene-dara"]')!;
    expect(btn.textContent).toContain('Dara');
    expect(btn.textContent).toContain('Message Dara');
    expect(btn.getAttribute('aria-label')).toMatch(/^Dara, AI guide/);
    act(() => { btn.click(); });
    expect(opened).toEqual(['dara']);
    off();
  });

  it('renders nothing when no agent stands at this floor', () => {
    act(() => { root.render(<FloorLobbyDesks desks={[]} variant="row" />); });
    expect(container.innerHTML).toBe('');
  });
});

describe('deskPlace', () => {
  it('names the floor for an agent with an office, and only the building otherwise', () => {
    expect(career).toBeDefined();
    expect(deskPlace({ office: '/admin/orchestration' }, career, false)).toMatch(/^the .+ on the Program floor$/);
    expect(deskPlace({ office: null }, career, false)).not.toMatch(/floor/);
    expect(deskPlace({ office: '/admin/not-a-page' }, career, false)).not.toMatch(/floor/);
  });
});
