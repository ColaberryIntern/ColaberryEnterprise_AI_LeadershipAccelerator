import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminWorkLedgerHealthPage from '../AdminWorkLedgerHealthPage';

/**
 * ProofDesk Outcomes & Learning — Milestone 5 (T010). Follows the established
 * no-browser smoke-check pattern already used for sibling admin pages
 * (AdminTrustCenterPage.smoke.test.tsx, AdminAcceleratorSessionTimelinePage.smoke.test.tsx):
 * `renderToStaticMarkup` never runs `useEffect` (no commit phase in static rendering),
 * so it never fires the real `getWorkLedgerHealth`/`getAgentTrust`/etc. API calls this
 * page makes on mount — it only proves the page's INITIAL render (before any of the
 * new M5 hooks resolve) is safe: no crash from the 4 new panel imports, the new
 * `usePolledResource` hook instances, or the new props wiring.
 */

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/work-ledger-health']}>
      <AdminWorkLedgerHealthPage />
    </MemoryRouter>,
  );
}

describe('AdminWorkLedgerHealthPage (ProofDesk Milestone 5 panel additions)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderPage()).not.toThrow();
    const html = renderPage();
    expect(html).toContain('spinner-border');
  });
});
