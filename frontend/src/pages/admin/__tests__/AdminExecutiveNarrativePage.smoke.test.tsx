import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminExecutiveNarrativePage from '../AdminExecutiveNarrativePage';

/**
 * ProofDesk Outcomes & Learning — Milestone 5 (T011). Follows the established
 * no-browser smoke-check pattern (AdminTrustCenterPage.smoke.test.tsx,
 * AdminWorkLedgerHealthPage.smoke.test.tsx): `renderToStaticMarkup` never runs
 * `useEffect`, so it never fires the real `getExecutiveNarrative` API call — it only
 * proves the page's INITIAL render (before the narrative fetch resolves) is safe: no
 * crash from the new window-toggle state, the honest-empty branch, or any of the 5
 * narrative section cards.
 */

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/executive-narrative']}>
      <AdminExecutiveNarrativePage />
    </MemoryRouter>,
  );
}

describe('AdminExecutiveNarrativePage (ProofDesk Milestone 5)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderPage()).not.toThrow();
    const html = renderPage();
    expect(html).toContain('spinner-border');
  });

  it('renders the Today/This week window toggle', () => {
    const html = renderPage();
    expect(html).toContain('Today');
    expect(html).toContain('This week');
  });
});
