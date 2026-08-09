import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AgentDetailPage from '../AgentDetailPage';

/**
 * Reese Phase 1 (T012). Follows the established no-browser smoke-check pattern
 * already used for sibling admin pages (AdminWorkLedgerHealthPage.smoke.test.tsx):
 * `renderToStaticMarkup` never runs `useEffect` (no commit phase in static
 * rendering), so it never fires the real `getAgentDetail` API call this page
 * makes on mount — it only proves the page's INITIAL render (loading state,
 * before the fetch resolves) is safe: no crash from `useParams`, the shell
 * component imports, or the props wiring. Full data-rendering behavior is
 * proven live in production verification (Phase I) with a real screenshot.
 */

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/agents/agent-1']}>
      <Routes>
        <Route path="/admin/agents/:id" element={<AgentDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentDetailPage (Reese Phase 1 transparency page)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderPage()).not.toThrow();
    const html = renderPage();
    expect(html).toContain('spinner-border');
  });
});
