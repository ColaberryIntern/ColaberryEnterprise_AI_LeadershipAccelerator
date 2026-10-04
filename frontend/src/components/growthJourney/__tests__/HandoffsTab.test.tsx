import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import HandoffsTab from '../HandoffsTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { HandoffQueueRow, HandoffQueueResponse } from '../../../services/growthJourneyQueueApi';

/**
 * The ranked handoff queue (Phase 6, T615).
 *
 * Every cell names the mutation it kills. The two load-bearing ones are about the
 * ORDER, because the queue's caption makes claims a naive implementation would get
 * wrong in a way no operator could see:
 *
 *   - `expected_value` is nullable and the SQL has no `NULLS LAST`, so unvalued
 *     handoffs sort ABOVE valued ones inside an urgency bucket. A column labelled
 *     "highest value first" would be false exactly where it matters;
 *   - there is no `id` tiebreaker, so paging is unstable.
 *
 * Neither is something this tab can fix - they are the server's order - so the
 * requirement is that the screen SAYS so, and these cells pin the saying.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyQueueApi', () => ({
  listHandoffQueue: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyQueueApi') as { listHandoffQueue: jest.Mock };

const WORDS = { subject: 'learner', relationship: 'enrolment', pipeline: 'path' };

const row = (over: Partial<HandoffQueueRow> = {}): HandoffQueueRow => ({
  id: 'h-1',
  tenant_id: 't-1',
  brand_id: 'b-1',
  program_id: 'p-1',
  subject_ref: 'lead:4711',
  lead_id: 4711,
  enrollment_id: null,
  decision_id: 'd-1',
  owner_queue: 'sales',
  assigned_to_type: null,
  assigned_to_id: null,
  ticket_id: 'tk-9',
  assignment_blocked_reason: null,
  priority: 'medium',
  // DECIMAL over JSON: a STRING. The trap this column carries.
  expected_value: '1500.00',
  urgent: false,
  reason: 'asked about enterprise pricing',
  best_channel: 'email',
  consent_basis: 'legitimate_interest',
  sla_due_at: '2026-10-03T08:00:00.000Z',
  status: 'queued',
  disposition: null,
  disposition_reason: null,
  disposition_at: null,
  dispositioned_by: null,
  return_to_ai: null,
  integration_refused: null,
  accepted_at: null,
  expired_at: null,
  source: 'decision_deferral',
  created_at: '2026-10-01T08:00:00.000Z',
  updated_at: '2026-10-01T08:00:00.000Z',
  ...over,
});

const page = (over: Partial<HandoffQueueResponse> = {}): HandoffQueueResponse => ({
  rows: [row()],
  total: 3,
  limit: 25,
  offset: 0,
  status: 'open',
  owner_queue: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;
const render = async (props: Partial<React.ComponentProps<typeof HandoffsTab>> = {}) => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <HandoffsTab words={WORDS} {...props} />
      </MemoryRouter>,
    );
  });
};
const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');
const bodyText = () => (container.querySelector('tbody')?.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listHandoffQueue.mockResolvedValue(page());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the order is described honestly', () => {
  // KILLS: a caption claiming "highest value first", or dropping the null-first
  // and unstable-paging caveats. Both are true of the server's order and neither
  // is visible from the rows.
  it('says an unvalued handoff sorts above a valued one in its bucket', async () => {
    await render();
    expect(text()).toContain('NO expected value sorts above valued ones');
  });

  it('says paging is not stable, so a page is a sample not a slice', async () => {
    await render();
    expect(text()).toContain('not stable');
    expect(text()).toContain('no tiebreaker');
  });

  it('says priority does not affect the ranking, though it is shown', async () => {
    await render();
    expect(text()).toContain('does not affect the ranking');
  });
});

describe('expected_value is a string and must not be treated as a number', () => {
  // KILLS: `row.expected_value.toFixed(2)` (throws on a string), or rendering the
  // raw `"1500.00"` inconsistently with the detail view.
  it('renders the DECIMAL string to two places', async () => {
    await render();
    expect(bodyText()).toContain('1500.00');
  });

  it('and a second value proves the formatting is derived', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [row({ expected_value: '87.5' })] }));
    await render();
    expect(bodyText()).toContain('87.50');
  });

  it('says none recorded for a null rather than rendering 0.00', async () => {
    // A handoff with no expected value is not a handoff worth nothing, and it is
    // the row that sorts to the TOP of its bucket - so saying 0 would be doubly
    // misleading.
    api.listHandoffQueue.mockResolvedValue(page({ rows: [row({ expected_value: null })] }));
    await render();
    // Scoped to the expected-value CELL. The whole-row version of this assertion
    // failed on the row's own timestamp `08:00:00.000Z`, which contains '0.00' -
    // the fourth time in this phase a whole-text substring check caught the wrong
    // thing. The cell index comes from the column order in the header.
    const cells = Array.from(container.querySelectorAll('tbody td')).map((c) => c.textContent ?? '');
    const valueCell = cells[2];
    expect(valueCell).toContain('none recorded');
    expect(valueCell).not.toContain('0.00');
  });
});

describe('the default status filter is the API default, and is named', () => {
  it('requests open rather than every status', async () => {
    await render();
    expect(api.listHandoffQueue).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' }));
  });

  it('echoes the status the SERVER reported', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ status: 'expired', owner_queue: 'ali' }));
    await render();
    const header = container.querySelector('.card-header')?.textContent ?? '';
    expect(header).toContain('expired');
    expect(header).toContain('ali');
  });

  it('names the filter in the empty state and says it is not everything', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [], total: 0 }));
    await render();
    expect(text()).toContain('No open handoffs in scope');
    expect(text()).toContain('default filter');
  });

  it('and gives no such hint when the operator chose the status', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [], total: 0, status: 'all' }));
    await render();
    expect(text()).not.toContain('default filter');
  });
});

describe('the links a row needs', () => {
  it('links the subject to its own detail page', async () => {
    await render();
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('/admin/growth-journey/handoffs/h-1');
  });

  /*
   * TWO links go to the ticket board and they are asserted SEPARATELY. One `.some()`
   * over every href on screen was the whole assertion until the verifier stripped
   * `?source=growth_journey` off the header button and the cell still passed, because
   * the row-level link satisfied it. An unscoped ticket board shows every source's
   * tickets, so each link carries the scope on its own evidence.
   */
  it('links the HEADER button to the ticket board scoped to this source', async () => {
    await render();
    const header = Array.from(container.querySelectorAll('a'))
      .filter((a) => !a.closest('tbody'))
      .map((a) => a.getAttribute('href'));
    expect(header).toContain('/admin/tickets?source=growth_journey');
  });

  it('and links the ROW’s own ticket to the same scoped board', async () => {
    await render();
    const inRow = Array.from(container.querySelectorAll('tbody a'))
      .map((a) => a.getAttribute('href'));
    expect(inRow).toContain('/admin/tickets?source=growth_journey');
  });

  it('says no ticket when assignment was blocked rather than linking nowhere', async () => {
    // `ticket_id` is null exactly when `assignment_blocked_reason` is set, so the
    // two render together and neither is a dead link.
    api.listHandoffQueue.mockResolvedValue(page({
      rows: [row({ ticket_id: null, assignment_blocked_reason: 'no_assignee_policy' })],
    }));
    await render();
    expect(bodyText()).toContain('no ticket');
    expect(bodyText()).toContain('no_assignee_policy');
  });

  it('builds NO /admin/agents link, because no id exists to build one from', async () => {
    // KILLS: `/admin/agents/${agent_name}`. The registry omits AiAgent.id and the
    // row carries no agent reference, so any such link goes nowhere. The spec asked
    // for it; the data cannot support it.
    await render();
    const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '');
    expect(hrefs.some((h) => h.startsWith('/admin/agents'))).toBe(false);
  });
});

describe('priority and urgency are separate signals', () => {
  it('renders both, since urgent is what actually ranks', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [row({ priority: 'critical', urgent: true })] }));
    await render();
    expect(bodyText()).toContain('critical');
    expect(bodyText()).toContain('urgent');
  });

  it('a low-priority non-urgent row shows neither as urgent', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [row({ priority: 'low', urgent: false })] }));
    await render();
    expect(bodyText()).toContain('low');
    expect(bodyText()).not.toContain('urgent');
  });
});

describe('the free text the API echoes raw is masked here', () => {
  it('masks an address in the subject pointer position', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [row({ subject_ref: 'lead:nope@example.com' })] }));
    await render();
    expect(bodyText()).not.toContain('nope@example.com');
  });

  it('positive control: a clean pointer renders verbatim', async () => {
    await render();
    expect(bodyText()).toContain('lead:4711');
  });
});

describe('figures come off the payload', () => {
  it('reports the served page', async () => {
    await render();
    expect(text()).toContain('of 3 handoffs');
  });

  it('and a second page proves it', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ total: 44, limit: 10, offset: 20 }));
    await render();
    expect(text()).toContain('of 44 handoffs');
    expect(text()).toContain('limit 10, offset 20');
  });
});

describe('the mechanical accessibility rules', () => {
  it('every data table carries thead.table-light with scoped column headers', async () => {
    await render();
    const tables = Array.from(container.querySelectorAll('table'));
    expect(tables.length).toBeGreaterThan(0);
    tables.forEach((t) => {
      expect(t.querySelector('thead')?.className ?? '').toContain('table-light');
      const cols = Array.from(t.querySelectorAll('thead th'));
      expect(cols.length).toBeGreaterThan(0);
      cols.forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
    });
  });

  it('pass with rows', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass when empty', async () => {
    api.listHandoffQueue.mockResolvedValue(page({ rows: [], total: 0 }));
    await render();
    expectNoA11yViolations(container);
  });
});
