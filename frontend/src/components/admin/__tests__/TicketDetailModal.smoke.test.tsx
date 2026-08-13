import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import TicketDetailModal from '../TicketDetailModal';

/**
 * Render-only smoke test for TicketDetailModal — no @testing-library/react (not
 * installed in this repo), matching the established convention
 * (WorkforceOSPage.smoke.test.tsx) of react-dom/client + act for stateful
 * fetch-driven components. This component calls the browser `fetch` directly
 * (not the `utils/api` wrapper `WorkforceOSPage` uses), so `global.fetch` is
 * mocked here instead.
 *
 * What's under test: Ali's live feedback ("format all time to cst") — the
 * Technical tab's "Created" meta line and Activity feed timestamps must show a
 * CST/CDT-labeled time, never the browser's raw local-time/unlabeled format the
 * old local `formatDate()` produced.
 */

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ token: 'test-token' }) }));

const TICKET = {
  id: 'ticket-1',
  ticket_number: 42,
  title: 'Reese autonomous outreach — inactivity (Jordan Rivera)',
  description: 'Reese is proactively reaching out to Jordan Rivera.',
  status: 'in_progress',
  priority: 'high',
  type: 'reese_autonomous_outreach',
  source: 'ai_workforce',
  created_by_type: 'ai_staff',
  created_by_id: 'reese-admin-1',
  assigned_to_type: 'ai_staff',
  assigned_to_id: 'reese-admin-1',
  parent_ticket_id: null,
  entity_type: 'reese_outreach_signal',
  entity_id: 'd6a4b017-6716-4673-96b5-ab3074b70191:inactivity',
  metadata: {},
  confidence: null,
  estimated_effort: null,
  due_date: null,
  completed_at: null,
  created_at: '2026-08-12T15:00:00Z', // Aug 12 2026 is CDT (UTC-5) -> 10:00 AM CDT
  updated_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago, relative to test run time
};

const ACTIVITY = [
  { id: 'act-1', actor_type: 'ai_staff', actor_id: 'reese-admin-1', action: 'created', from_value: null, to_value: 'in_progress', comment: null, metadata: null, created_at: '2026-08-12T15:00:00Z' },
];

function mockFetch() {
  (global as any).fetch = jest.fn((url: string) => {
    if (url === '/api/admin/tickets/ticket-1') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ ticket: TICKET, activities: ACTIVITY, subTasks: [] }),
      });
    }
    // The default (Story) tab mounts and fetches its own summary — mocked so the
    // test settles deterministically rather than leaving a real rejected fetch
    // pending past this test's act() window.
    if (url === '/api/admin/tickets/ticket-1/summary') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ outcome: 'Outcome: dispatch completed.', proof: 'Proof: none yet.', humanAction: 'Human action: none.', hasEvidence: false }),
      });
    }
    return Promise.reject(new Error(`unexpected fetch ${url}`));
  });
}

let container: HTMLDivElement;
let root: Root;

async function renderModal() {
  await act(async () => {
    root.render(<TicketDetailModal ticketId="ticket-1" onClose={() => {}} onUpdate={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockFetch();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
  jest.restoreAllMocks();
});

describe('TicketDetailModal — CST/CDT-labeled timestamps (Ali\'s live feedback: "format all time to cst")', () => {
  it('renders the Technical tab\'s "Created" meta line with a CST/CDT label, never a raw/unlabeled time', async () => {
    await renderModal();

    // Switch to the Technical tab (default tab is Story per T008).
    const technicalTabButton = Array.from(container.querySelectorAll('button.nav-link')).find(
      (el) => el.textContent === 'Technical',
    ) as HTMLElement;
    expect(technicalTabButton).toBeTruthy();
    await act(async () => {
      technicalTabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('10:00 AM CDT');
    expect(container.textContent).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/); // never a raw ISO timestamp
  });

  it('renders the Activity feed timestamp with a CST/CDT label too', async () => {
    await renderModal();

    const technicalTabButton = Array.from(container.querySelectorAll('button.nav-link')).find(
      (el) => el.textContent === 'Technical',
    ) as HTMLElement;
    await act(async () => {
      technicalTabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Two occurrences: the "Created" meta line and the one activity row, both
    // driven by the same 2026-08-12T15:00:00Z fixture timestamp.
    const matches = container.textContent?.match(/10:00 AM CDT/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('does NOT contain a raw enrollment UUID in the ticket title (Fix 1 regression guard on the same real-ticket fixture)', async () => {
    await renderModal();
    expect(container.textContent).toContain('Jordan Rivera');
    expect(container.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });
});

// T010 (ticket-ux-fixes run) — "We should also be able to see how long it's
// been since a ticket has been worked on." (Ali, live feedback.)
describe('TicketDetailModal — "last activity" indicator', () => {
  it('renders a real, computed "Last activity: X ago" line on the Technical tab, not a static string', async () => {
    await renderModal();

    const technicalTabButton = Array.from(container.querySelectorAll('button.nav-link')).find(
      (el) => el.textContent === 'Technical',
    ) as HTMLElement;
    await act(async () => {
      technicalTabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Fixture's updated_at is 3 hours before test-run time -> timeAgo() -> "3h ago".
    expect(container.textContent).toContain('Last activity:');
    expect(container.textContent).toContain('3h ago');
  });

  it('boundary: a ticket with no updated_at ever recorded shows "unknown" rather than crashing or showing blank', async () => {
    (global as any).fetch = jest.fn((url: string) => {
      if (url === '/api/admin/tickets/ticket-1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ticket: { ...TICKET, updated_at: null }, activities: ACTIVITY, subTasks: [] }),
        });
      }
      if (url === '/api/admin/tickets/ticket-1/summary') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ outcome: 'Outcome: dispatch completed.', proof: 'Proof: none yet.', humanAction: 'Human action: none.', hasEvidence: false }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    await renderModal();
    const technicalTabButton = Array.from(container.querySelectorAll('button.nav-link')).find(
      (el) => el.textContent === 'Technical',
    ) as HTMLElement;
    await act(async () => {
      technicalTabButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('Last activity:');
    expect(container.textContent).toContain('unknown');
  });
});

// T011 (ticket-ux-fixes run) — "Anything over 3 days old should have a valid
// reason why it's still open." (Ali, live feedback — see request.md's noted
// "closed"/"open" reading.) Visibility only: no status change, no auto-close.
describe('TicketDetailModal — stale-ticket (3+ day) visible flag', () => {
  const FOUR_DAYS_AGO = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
  const ONE_HOUR_AGO = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  function mockTicketFetch(ticketOverrides: Partial<typeof TICKET>) {
    (global as any).fetch = jest.fn((url: string) => {
      if (url === '/api/admin/tickets/ticket-1') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ ticket: { ...TICKET, ...ticketOverrides }, activities: ACTIVITY, subTasks: [] }),
        });
      }
      if (url === '/api/admin/tickets/ticket-1/summary') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ outcome: 'Outcome: dispatch completed.', proof: 'Proof: none yet.', humanAction: 'Human action: none.', hasEvidence: false }),
        });
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });
  }

  it('shows the stale banner for an OPEN ticket with no activity in 4+ days', async () => {
    mockTicketFetch({ status: 'in_progress', updated_at: FOUR_DAYS_AGO });
    await renderModal();

    expect(container.querySelector('.alert-warning')).toBeTruthy();
    expect(container.textContent).toContain('needs a reason');
  });

  it('does NOT show the stale banner for a FRESH open ticket (updated within the last hour)', async () => {
    mockTicketFetch({ status: 'in_progress', updated_at: ONE_HOUR_AGO });
    await renderModal();

    expect(container.querySelector('.alert-warning')).toBeFalsy();
  });

  it('does NOT show the stale banner for a DONE ticket, even one 4+ days old — closed isn\'t stale, it\'s closed', async () => {
    mockTicketFetch({ status: 'done', updated_at: FOUR_DAYS_AGO });
    await renderModal();

    expect(container.querySelector('.alert-warning')).toBeFalsy();
  });
});
