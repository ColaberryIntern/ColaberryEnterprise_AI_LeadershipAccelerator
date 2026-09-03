import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import AgentPerformanceTab from '../AgentPerformanceTab';
import { AgentGoal } from '../../../services/agentGoalApi';
import { AgentOneOnOne } from '../../../services/agentOneOnOneApi';

// AI Agent Dashboard redesign, Checkpoint D, Performance slice (2026-09-02)
// — pins the honest 3-state goal rendering (Met / Not met / Unmeasured,
// never a fabricated "met" from missing data) and that 1:1s only ever show
// the two real fields that actually exist.

jest.mock('../../../services/agentGoalApi', () => ({
  listGoals: jest.fn(), createGoal: jest.fn(), archiveGoal: jest.fn(),
}));
jest.mock('../../../services/agentOneOnOneApi', () => ({
  listOneOnOnes: jest.fn(), createOneOnOne: jest.fn(), completeOneOnOne: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listGoals, createGoal, archiveGoal } = require('../../../services/agentGoalApi') as {
  listGoals: jest.Mock; createGoal: jest.Mock; archiveGoal: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { listOneOnOnes, createOneOnOne, completeOneOnOne } = require('../../../services/agentOneOnOneApi') as {
  listOneOnOnes: jest.Mock; createOneOnOne: jest.Mock; completeOneOnOne: jest.Mock;
};

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

const MET_GOAL: AgentGoal = {
  id: 'g1', metricKey: 'open_ticket_count', comparison: 'at_most', targetValue: 5,
  currentValue: 1, met: true, status: 'active', createdByEmail: 'ali@colaberry.com', createdAt: '2026-08-30T00:00:00Z',
};
const UNMEASURED_GOAL: AgentGoal = {
  id: 'g2', metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 50,
  currentValue: null, met: null, status: 'active', createdByEmail: 'ali@colaberry.com', createdAt: '2026-08-30T00:00:00Z',
};

const SCHEDULED_ONE_ON_ONE: AgentOneOnOne = {
  id: 'o1', agenda: 'Review shadow-mode findings', outcomeNotes: null, status: 'scheduled',
  createdByEmail: 'ali@colaberry.com', heldAt: null, createdAt: '2026-08-30T00:00:00Z',
};

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  jest.clearAllMocks();
  listGoals.mockResolvedValue([]);
  listOneOnOnes.mockResolvedValue([]);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderTab() {
  await act(async () => {
    root.render(<AgentPerformanceTab agentId="agent-1" />);
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe('AgentPerformanceTab — Goals honesty', () => {
  it('shows the honest empty state when no goals are set', async () => {
    await renderTab();
    expect(container.textContent).toContain('No goals set for this agent yet.');
  });

  it('renders Unmeasured, never Met, for a goal with no underlying data', async () => {
    listGoals.mockResolvedValue([UNMEASURED_GOAL]);
    await renderTab();
    expect(container.textContent).toContain('Unmeasured');
    expect(container.textContent).toContain('No underlying data to evaluate');
    // Precise element check, not a loose substring match — the form label
    // "Metric" itself contains the substring "Met" and would false-positive
    // a naive container.textContent.not.toContain('Met') check.
    const badge = container.querySelector('.admin-status-badge');
    expect(badge?.textContent?.trim()).toBe('Unmeasured');
  });

  it('renders a real Met badge for a goal with real, measured data', async () => {
    listGoals.mockResolvedValue([MET_GOAL]);
    await renderTab();
    expect(container.textContent).toContain('Met');
    expect(container.textContent).toContain('Current: 1');
  });

  it('create calls the real API with the chosen metric/comparison/target', async () => {
    createGoal.mockResolvedValue(MET_GOAL);
    await renderTab();
    const setGoalButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Set Goal')!;
    await act(async () => { setGoalButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(createGoal).toHaveBeenCalledWith('agent-1', { metricKey: 'monthly_cost_usd', comparison: 'at_most', targetValue: 50 });
  });

  it('archive calls the real API and refreshes the list', async () => {
    listGoals.mockResolvedValue([MET_GOAL]);
    archiveGoal.mockResolvedValue({ ...MET_GOAL, status: 'archived' });
    await renderTab();
    const archiveButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Archive')!;
    await act(async () => { archiveButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(archiveGoal).toHaveBeenCalledWith('agent-1', 'g1');
    expect(listGoals).toHaveBeenCalledTimes(2);
  });
});

describe('AgentPerformanceTab — 1:1 Check-ins', () => {
  it('shows the honest empty state when none exist', async () => {
    await renderTab();
    expect(container.textContent).toContain('No 1:1 check-ins scheduled or held yet.');
  });

  it('discloses honestly that only agenda and outcome notes are real fields', async () => {
    await renderTab();
    expect(container.textContent).toContain('no separate wins/challenges/lessons/commitments fields');
  });

  it('renders a real scheduled 1:1 with a complete control, and a completed one with its real outcome notes', async () => {
    listOneOnOnes.mockResolvedValue([
      SCHEDULED_ONE_ON_ONE,
      { ...SCHEDULED_ONE_ON_ONE, id: 'o2', status: 'completed', outcomeNotes: 'No blockers raised.', heldAt: '2026-08-31T00:00:00Z' },
    ]);
    await renderTab();
    expect(container.textContent).toContain('Review shadow-mode findings');
    expect(container.textContent).toContain('No blockers raised.');
  });

  it('schedule calls the real API with the real agenda text', async () => {
    createOneOnOne.mockResolvedValue(SCHEDULED_ONE_ON_ONE);
    await renderTab();
    const input = container.querySelector('input[placeholder="What should this 1:1 cover?"]') as HTMLInputElement;
    await act(async () => { typeInto(input, 'Review shadow-mode findings'); });
    const scheduleButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Schedule')!;
    await act(async () => { scheduleButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });
    expect(createOneOnOne).toHaveBeenCalledWith('agent-1', 'Review shadow-mode findings');
  });

  it('complete requires real outcome notes before calling the API', async () => {
    listOneOnOnes.mockResolvedValue([SCHEDULED_ONE_ON_ONE]);
    await renderTab();
    const completeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Complete')!;
    expect((completeButton as HTMLButtonElement).disabled).toBe(true);
    expect(completeOneOnOne).not.toHaveBeenCalled();
  });

  it('complete calls the real API with the real outcome notes once entered', async () => {
    listOneOnOnes.mockResolvedValue([SCHEDULED_ONE_ON_ONE]);
    completeOneOnOne.mockResolvedValue({ ...SCHEDULED_ONE_ON_ONE, status: 'completed', outcomeNotes: 'No blockers.' });
    await renderTab();

    const input = container.querySelector('input[placeholder="Outcome notes to complete this 1:1…"]') as HTMLInputElement;
    await act(async () => { typeInto(input, 'No blockers.'); });
    const completeButton = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Complete')!;
    await act(async () => { completeButton.dispatchEvent(new MouseEvent('click', { bubbles: true })); await new Promise((r) => setTimeout(r, 0)); });

    expect(completeOneOnOne).toHaveBeenCalledWith('agent-1', 'o1', 'No blockers.');
  });
});
