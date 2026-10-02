import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import DecisionsTab from '../DecisionsTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type {
  DecisionRow, DecisionsResponse, TransitionRow, TransitionsResponse,
} from '../../../services/growthJourneyInspectApi';

/**
 * The decisions tab and its transitions panel (Phase 6, T614).
 *
 * Two reads, two envelopes, and the cells below hold three things that are easy to
 * get wrong and invisible when wrong:
 *
 *   - `mode` defaults to `shadow`, so an empty table means "no shadow decisions",
 *     not "no decisions";
 *   - `mode` and `executed` are different facts and a reader must not be able to
 *     infer one from the other;
 *   - `reason` is masked by the API on the transitions read and NOT on the decisions
 *     read, so the same-named column is handled differently in the two tables on
 *     purpose. `*_redacted` distinguishes "held an address" from "was empty".
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listDecisions: jest.fn(),
  listTransitions: jest.fn(),
  getDecisionWhy: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyInspectApi') as {
  listDecisions: jest.Mock;
  listTransitions: jest.Mock;
  getDecisionWhy: jest.Mock;
};

const WORDS = { subject: 'learner', relationship: 'enrolment', pipeline: 'path' };

const dRow = (over: Partial<DecisionRow> = {}): DecisionRow => ({
  id: 'd-1',
  tenant_id: 't-1',
  brand_id: 'b-1',
  program_id: 'p-1',
  subject_ref: 'lead:4711',
  classification_id: 'c-1',
  trigger: 'nightly',
  decision_date: '2026-09-27',
  mode: 'shadow',
  selected_action: 'SEND_EDUCATION',
  selected_path: 'ai_leadership',
  selected_channel: 'email',
  state_at_decision: 'nurturing',
  reason: 'next step in the path',
  requires_human_review: false,
  ai_involved: false,
  model_version: null,
  ruleset_version: 'r-1',
  executed: false,
  decided_by: 'engine',
  created_at: '2026-09-27T04:00:00.000Z',
  ...over,
});

const dPage = (over: Partial<DecisionsResponse> = {}): DecisionsResponse => ({
  rows: [dRow()], total: 4, limit: 25, offset: 0, mode: 'shadow', ...over,
});

const tRow = (over: Partial<TransitionRow> = {}): TransitionRow => ({
  id: 'tr-1',
  brand_id: 'b-1',
  program_id: 'p-1',
  subject_ref: 'lead:4711',
  transition_type: 'state_change',
  status: 'applied',
  from_state: 'new',
  to_state: 'nurturing',
  reason: 'classified',
  reason_redacted: false,
  requested_by: 'engine',
  requested_by_redacted: false,
  created_at: '2026-09-27T04:00:00.000Z',
  ...over,
});

const tPage = (over: Partial<TransitionsResponse> = {}): TransitionsResponse => ({
  rows: [tRow()],
  total: 2,
  limit: 25,
  offset: 0,
  scope: { tenant_id: 't-1', brand_id: 'b-1', program_id: 'p-1' },
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (props: Partial<React.ComponentProps<typeof DecisionsTab>> = {}) => {
  await act(async () => { root.render(<DecisionsTab words={WORDS} {...props} />); });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listDecisions.mockResolvedValue(dPage());
  api.listTransitions.mockResolvedValue(tPage());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('shadow is the default, and the screen does not hide it', () => {
  it('requests shadow rather than all modes', async () => {
    await render();
    expect(api.listDecisions).toHaveBeenCalledWith(expect.objectContaining({ mode: 'shadow' }));
  });

  it('says an empty LIVE list is expected rather than broken', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [], total: 0, mode: 'live' }));
    await render();
    expect(text()).toContain('No live decisions in scope');
    expect(text()).toContain('Nothing in this system sends yet');
  });

  it('does not offer that reassurance for an empty shadow list, which IS a gap', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [], total: 0, mode: 'shadow' }));
    await render();
    expect(text()).not.toContain('Nothing in this system sends yet');
  });
});

describe('mode and executed are separate facts', () => {
  it('renders both, so neither can be inferred from the other', async () => {
    await render();
    // Scoped to the row: 'shadow' is also an option label in the mode dropdown.
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('shadow');
    expect(body).toContain('not executed');
  });

  it('a LIVE decision that has not run still reads as not executed', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [dRow({ mode: 'live', executed: false })], mode: 'live' }));
    await render();
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('live');
    expect(body).toContain('not executed');
  });

  it('and an executed one says so', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [dRow({ mode: 'live', executed: true })], mode: 'live' }));
    await render();
    const body = container.querySelector('tbody')?.textContent ?? '';
    expect(body).toContain('executed');
    expect(body).not.toContain('not executed');
  });

  it('says so when no action was chosen rather than leaving a blank', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [dRow({ selected_action: null, selected_channel: null })] }));
    await render();
    expect(text()).toContain('no action chosen');
  });
});

describe('the decisions list is masked client-side; transitions report the API mask', () => {
  it('masks an address the decisions read served raw', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [dRow({ reason: 'ping lead@example.com' })] }));
    await render();
    expect(text()).not.toContain('lead@example.com');
    expect(text()).toContain('[redacted]');
  });

  it('positive control: a clean reason renders verbatim', async () => {
    await render();
    expect(text()).toContain('next step in the path');
  });

  it('reports a transitions value the API redacted as redacted, not as absent', async () => {
    api.listTransitions.mockResolvedValue(tPage({
      rows: [tRow({ reason: 'redacted', reason_redacted: true })],
    }));
    await render();
    expect(text()).toContain('redacted by the API');
  });

  it('and an EMPTY column as not recorded - a different fact from redacted', async () => {
    api.listTransitions.mockResolvedValue(tPage({
      rows: [tRow({ requested_by: 'unknown', requested_by_redacted: false })],
    }));
    await render();
    // Scoped to the row. `'not recorded'` is also caption copy on this tab, so a
    // whole-render assertion could not fail - the verifier proved it by disabling
    // MaskedValue's `value === 'unknown'` branch and watching 194/194 stay green.
    const bodies = Array.from(container.querySelectorAll('tbody')).map((b) => b.textContent ?? '');
    expect(bodies.join('|')).toContain('not recorded');
  });
});

describe('the two reads fail and empty independently', () => {
  it('a failed decisions read leaves the transitions panel standing', async () => {
    api.listDecisions.mockRejectedValue(new Error('decisions exploded'));
    await render();
    expect(text()).toContain('decisions exploded');
    expect(text()).toContain('state_change');
  });

  it('a failed transitions read leaves the decisions table standing', async () => {
    api.listTransitions.mockRejectedValue(new Error('transitions exploded'));
    await render();
    expect(text()).toContain('transitions exploded');
    expect(text()).toContain('lead:4711');
  });

  it('transitions is the one read that honours program_id, and passes it', async () => {
    await render({ programId: 'p-9' });
    expect(api.listTransitions).toHaveBeenCalledWith(expect.objectContaining({ program_id: 'p-9' }));
    // and the decisions read must NOT be given one: the API does not accept it
    expect(api.listDecisions).toHaveBeenCalledWith(
      expect.not.objectContaining({ program_id: expect.anything() }),
    );
  });

  it('echoes the scope the server APPLIED, which can differ from what was asked', async () => {
    api.listTransitions.mockResolvedValue(tPage({
      scope: { tenant_id: 't-1', brand_id: null, program_id: null },
    }));
    await render({ programId: 'p-9' });
    expect(text()).toContain('all in scope');
  });
});

describe('figures come off the payload', () => {
  it('reports the served page', async () => {
    await render();
    expect(text()).toContain('of 4 decisions');
    expect(text()).toContain('limit 25, offset 0');
  });

  it('and a second page proves it, since no literal satisfies both', async () => {
    api.listDecisions.mockResolvedValue(dPage({ total: 61, limit: 10, offset: 30 }));
    await render();
    expect(text()).toContain('of 61 decisions');
    expect(text()).toContain('limit 10, offset 30');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass with both panels populated', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass with both empty', async () => {
    api.listDecisions.mockResolvedValue(dPage({ rows: [], total: 0 }));
    api.listTransitions.mockResolvedValue(tPage({ rows: [], total: 0 }));
    await render();
    expectNoA11yViolations(container);
  });
});
