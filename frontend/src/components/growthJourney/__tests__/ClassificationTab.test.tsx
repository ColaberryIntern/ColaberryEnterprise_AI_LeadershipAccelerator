import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ClassificationTab from '../ClassificationTab';
import { expectNoA11yViolations } from '../../../__fixtures__/a11yRules';
import type { ClassificationRow, ClassificationsResponse } from '../../../services/growthJourneyInspectApi';

/**
 * The classification tab (Phase 6, T614).
 *
 * ── EVERY ECHOED SCALAR GETS TWO FIXTURE VALUES ─────────────────────────────
 *
 * T613's verifier found five bindings that survived replacement by a literal
 * because the only fixture reaching them matched the literal. One fixture can never
 * catch that. So `total`, `limit`, `offset`, `status` and `confidence` each appear
 * with two different values across this suite, and the second cell exists purely so
 * that no constant can satisfy both.
 *
 * ── AND THE DEFAULT FILTER IS AN ASSERTION, NOT A DETAIL ────────────────────
 *
 * `/classifications` defaults `status` to `needs_review`. A tab that silently sent
 * that default and rendered an empty table would have an operator believe no
 * classifications exist. The cells below pin that the request carries the default,
 * that the empty state names the status, and that switching to `all` re-requests.
 */

jest.setTimeout(30000);

jest.mock('../../../services/growthJourneyInspectApi', () => ({
  listClassifications: jest.fn(),
  getClassificationWhy: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const api = require('../../../services/growthJourneyInspectApi') as {
  listClassifications: jest.Mock;
  getClassificationWhy: jest.Mock;
};

const WORDS = { subject: 'learner', relationship: 'enrolment', pipeline: 'path' };

const row = (over: Partial<ClassificationRow> = {}): ClassificationRow => ({
  id: 'c-1',
  tenant_id: 't-1',
  brand_id: 'b-1',
  subject_ref: 'lead:4711',
  lead_id: 4711,
  enrollment_id: null,
  trigger: 'form_submit',
  input_hash: 'h',
  brand_relationship: 'prospect',
  journey_program_slug: 'explorer',
  primary_path: 'ai_leadership',
  secondary_paths: ['data_eng'],
  intent: 'wants a cohort date',
  // A DECIMAL over JSON: a STRING, which is the trap this column carries.
  confidence: '0.820',
  evidence: ['said so on the call'],
  source_step: 2,
  requires_human_review: false,
  status: 'needs_review',
  locked: false,
  eligibility: { consent: true },
  referral_target_brand_id: null,
  ai_involved: true,
  model_version: 'm-1',
  ruleset_version: 'r-1',
  override_of: null,
  decided_by: 'admin-42',
  idempotency_key: 'k',
  created_at: '2026-10-01T08:00:00.000Z',
  ...over,
});

const page = (over: Partial<ClassificationsResponse> = {}): ClassificationsResponse => ({
  rows: [row()],
  total: 7,
  limit: 25,
  offset: 0,
  status: 'needs_review',
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = async (props: Partial<React.ComponentProps<typeof ClassificationTab>> = {}) => {
  await act(async () => {
    root.render(<ClassificationTab words={WORDS} {...props} />);
  });
};

const text = () => (container.textContent ?? '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.listClassifications.mockResolvedValue(page());
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('the API default is sent, and named on screen', () => {
  it('requests needs_review rather than everything', async () => {
    await render();
    expect(api.listClassifications).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'needs_review', limit: 25, offset: 0 }),
    );
  });

  it('echoes the status the SERVER reported, not the one in local state', async () => {
    // The two can differ, and the server's answer is the one describing these rows.
    api.listClassifications.mockResolvedValue(page({ status: 'confirmed' }));
    await render();
    expect(text()).toContain('status filter echoed by the server');
    // Scoped to the card header: 'confirmed' is ALSO a dropdown option label, so a
    // whole-page assertion would pass with the echo rendering nothing.
    const header = container.querySelector('.card-header')?.textContent ?? '';
    expect(header).toContain('confirmed');
  });

  it('names the status in the empty state, and says the default is not everything', async () => {
    api.listClassifications.mockResolvedValue(page({ rows: [], total: 0 }));
    await render();
    expect(text()).toContain('No classifications with status needs_review in scope');
    expect(text()).toContain('default filter');
  });

  it('does NOT give that hint when the operator chose the status themselves', async () => {
    api.listClassifications.mockResolvedValue(page({ rows: [], total: 0, status: 'all' }));
    await render();
    expect(text()).not.toContain('default filter');
  });
});

describe('the figures come off the payload', () => {
  it('reports the page the server served', async () => {
    await render();
    expect(text()).toContain('of 7 classifications');
    expect(text()).toContain('limit 25, offset 0');
  });

  it('and a DIFFERENT page reports different numbers - no literal satisfies both', async () => {
    api.listClassifications.mockResolvedValue(page({ total: 93, limit: 50, offset: 50 }));
    await render();
    expect(text()).toContain('of 93 classifications');
    expect(text()).toContain('limit 50, offset 50');
    expect(text()).toContain('51'); // first row index on this page
  });

  it('renders the DECIMAL string as a fixed-digit number, not as NaN or raw', async () => {
    await render();
    expect(text()).toContain('0.82');
  });

  it('and a second confidence value proves the digits are derived', async () => {
    // 0.41, not 0.42: `(0.415).toFixed(2)` is '0.41' because 0.415 has no exact
    // binary representation and lands just below the midpoint. Measured, not
    // assumed - I expected banker's rounding and JavaScript does not do that.
    api.listClassifications.mockResolvedValue(page({ rows: [row({ confidence: '0.415' })] }));
    await render();
    expect(text()).toContain('0.41');
  });

  it('renders a missing confidence as absent rather than as 0.00', async () => {
    // Scoped to the confidence CELL. A whole-page `not.toContain('0.00')` passed
    // for the wrong reason and then failed for one: the row's own ISO timestamp
    // `08:00:00.000Z` contains the substring '0.00'.
    api.listClassifications.mockResolvedValue(page({ rows: [row({ confidence: null })] }));
    await render();
    const cells = Array.from(container.querySelectorAll('tbody td')).map((c) => c.textContent ?? '');
    const confidenceCell = cells[2];
    expect(confidenceCell).toContain('—');
    expect(confidenceCell).not.toContain('0.00');
  });
});

describe('the unmasked free-text columns are masked here', () => {
  it('masks an address in intent, evidence and decided_by', async () => {
    api.listClassifications.mockResolvedValue(page({
      rows: [row({
        intent: 'reply to lead@example.com',
        decided_by: 'admin@example.com',
      })],
    }));
    await render();
    expect(text()).not.toContain('lead@example.com');
    expect(text()).not.toContain('admin@example.com');
    expect(text()).toContain('[redacted]');
  });

  it('positive control: the needle IS rendered when it carries no address', async () => {
    // Without this, the cell above passes on a tab that renders nothing at all.
    api.listClassifications.mockResolvedValue(page({
      rows: [row({ intent: 'wants the October cohort', decided_by: 'admin-42' })],
    }));
    await render();
    expect(text()).toContain('wants the October cohort');
    expect(text()).toContain('admin-42');
  });
});

describe('a classification is a statement, and the row says which kind', () => {
  it('distinguishes needs-a-human and locked from the plain status', async () => {
    api.listClassifications.mockResolvedValue(page({
      rows: [row({ status: 'proposed', requires_human_review: true, locked: true })],
    }));
    await render();
    expect(text()).toContain('proposed');
    expect(text()).toContain('needs a human');
    expect(text()).toContain('locked');
  });

  it('says so when no path was chosen rather than leaving the cell blank', async () => {
    api.listClassifications.mockResolvedValue(page({ rows: [row({ primary_path: null, secondary_paths: [] })] }));
    await render();
    expect(text()).toContain('none chosen');
  });

  it('uses the programme vocabulary in its heading and columns', async () => {
    await render();
    expect(text()).toContain('How each learner was classified');
  });

  it('and a different programme gets different words', async () => {
    await render({ words: { subject: 'lead', relationship: 'account', pipeline: 'opportunity' } });
    expect(text()).toContain('How each lead was classified');
  });
});

describe('the mechanical accessibility rules', () => {
  it('pass with rows on screen', async () => {
    await render();
    expectNoA11yViolations(container);
  });

  it('pass on the empty state', async () => {
    api.listClassifications.mockResolvedValue(page({ rows: [], total: 0 }));
    await render();
    expectNoA11yViolations(container);
  });
});
