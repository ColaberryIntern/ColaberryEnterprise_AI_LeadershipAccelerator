import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ShadowTab from '../ShadowTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { ShadowRunRow, ShadowRunsResponse } from '../../../services/growthJourneyInspectApi';

/**
 * The shadow-runs tab (Phase 6, T614).
 *
 * This read is the odd one out of the nine and the cells below pin why, because
 * every one of these properties is a thing a reasonable developer would "fix" into
 * a bug:
 *
 *   - it accepts NO `brand_id`. Zod strips it, the SQL carries no brand clause, and
 *     the response echoes `scope.brand_id: null`. Offering a brand filter would be
 *     a control that silently does nothing.
 *   - it is the ONLY read that returns rows to an admin with no tenant membership,
 *     deliberately: whether a cron ran is a fact about the deployment.
 *   - `counts_available` is hard-coded `false` and cannot become true. It is a
 *     statement, not a toggle.
 *   - a failed run carries a trace id and nothing else, by design.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listShadowRuns: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyInspectApi') as {
  listShadowRuns: jest.Mock;
};

const AGENTS = [
  'GrowthJourneyShadowDecisions',
  'GrowthJourneyExecutor',
  'GrowthJourneyHandoffDigest',
] as const;

const row = (over: Partial<ShadowRunRow> = {}): ShadowRunRow => ({
  id: 's-1',
  agent: 'GrowthJourneyShadowDecisions',
  result: 'success',
  duration_ms: 1240,
  trace_id: 'tr-abc',
  started_at: '2026-10-01T04:00:00.000Z',
  ...over,
});

const page = (over: Partial<ShadowRunsResponse> = {}): ShadowRunsResponse => ({
  rows: [row()],
  total: 3,
  limit: 25,
  offset: 0,
  window_days: 7,
  agents: AGENTS,
  counts_available: false,
  scope: { tenant_id: 't-1', brand_id: null, program_id: null },
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async () => {
  await act(async () => { root.render(<ShadowTab />); });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listShadowRuns.mockResolvedValue(page());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('this read is not brand-scoped, and the tab must not imply otherwise', () => {
  it('never sends a brand_id, because the API does not accept one', async () => {
    await render();
    expect(api.listShadowRuns).toHaveBeenCalledWith(
      expect.not.objectContaining({ brand_id: expect.anything() }),
    );
  });

  it('offers no brand control at all - a filter that does nothing is worse than none', async () => {
    await render();
    const labels = Array.from(container.querySelectorAll('label')).map((l) => l.textContent ?? '');
    expect(labels.join('|').toLowerCase()).not.toContain('brand');
  });

  it('says on screen that the read is not brand-scoped', async () => {
    await render();
    expect(text()).toContain('not brand-scoped');
  });
});

describe('counts_available is a fact, not a toggle', () => {
  it('states that no per-run counts exist', async () => {
    await render();
    expect(text()).toContain('No per-run counts exist');
  });

  it('and says nothing of the sort if the API ever starts reporting them', async () => {
    // Pins the branch rather than the constant: if the backend gains per-run
    // detail, this sentence must disappear on its own.
    api.listShadowRuns.mockResolvedValue(page({ counts_available: true }));
    await render();
    expect(text()).not.toContain('No per-run counts exist');
  });
});

describe('the agent list comes from the response, not from a local copy', () => {
  it('builds the dropdown from the agents the server returned', async () => {
    await render();
    const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent ?? '');
    AGENTS.forEach((a) => expect(options).toContain(a));
  });

  it('and follows the server when the registry changes', async () => {
    api.listShadowRuns.mockResolvedValue(page({ agents: ['OnlyOneAgent'] }));
    await render();
    const options = Array.from(container.querySelectorAll('option')).map((o) => o.textContent ?? '');
    expect(options).toContain('OnlyOneAgent');
    expect(options).not.toContain('GrowthJourneyExecutor');
  });
});

describe('a failure reports what it can and says what it cannot', () => {
  it('shows the trace id for a failed run', async () => {
    api.listShadowRuns.mockResolvedValue(page({
      rows: [row({ result: 'failed', trace_id: 'tr-zzz', duration_ms: null })],
    }));
    await render();
    // Scoped to the row: 'failed' is also an option label in the result dropdown.
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('failed');
    expect(body).toContain('tr-zzz');
    // the reason is never served, and the duration is genuinely absent here
    expect(text()).toContain('not recorded');
  });

  it('says a missing trace is none rather than rendering an empty cell', async () => {
    api.listShadowRuns.mockResolvedValue(page({ rows: [row({ trace_id: null })] }));
    await render();
    expect(text()).toContain('none');
  });
});

describe('the window is the one the server applied', () => {
  it('reports it, and the default is 7 days', async () => {
    await render();
    expect(api.listShadowRuns).toHaveBeenCalledWith(expect.objectContaining({ window_days: 7 }));
    expect(text()).toContain('window applied by the server: 7 days');
  });

  it('and a clamped window reports the SERVER value, not the request', async () => {
    // The API clamps to 1..365, so the echo can differ from what was asked.
    api.listShadowRuns.mockResolvedValue(page({ window_days: 365 }));
    await render();
    expect(text()).toContain('window applied by the server: 365 days');
  });

  it('names the window in the empty state, since empty means "not in this window"', async () => {
    api.listShadowRuns.mockResolvedValue(page({ rows: [], total: 0, window_days: 30 }));
    await render();
    expect(text()).toContain('No shadow runs in the last 30 days in scope');
    expect(text()).toContain('crons have not run in this window');
  });
});

describe('figures come off the payload', () => {
  it('reports the served page', async () => {
    await render();
    expect(text()).toContain('of 3 shadow runs');
    expect(text()).toContain('1240 ms');
  });

  it('and a second set proves the numbers are read, not printed', async () => {
    api.listShadowRuns.mockResolvedValue(page({ total: 88, limit: 50, offset: 50, rows: [row({ duration_ms: 77 })] }));
    await render();
    expect(text()).toContain('of 88 shadow runs');
    expect(text()).toContain('77 ms');
    expect(text()).toContain('limit 50, offset 50');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass with rows', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass when empty', async () => {
    api.listShadowRuns.mockResolvedValue(page({ rows: [], total: 0 }));
    await render();
    expectNoA11yViolations(container);
  });
});
