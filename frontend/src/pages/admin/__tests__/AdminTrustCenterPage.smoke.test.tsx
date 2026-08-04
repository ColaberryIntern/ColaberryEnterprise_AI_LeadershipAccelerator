import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import AdminTrustCenterPage from '../AdminTrustCenterPage';

/**
 * Phase B frontend drill-down wiring (T014-T020, run 20260802-084012-trust-90-drilldown,
 * Session CC-20260731-tc8x). No browser is reachable in this environment, so this follows the
 * established no-browser smoke-check pattern already used for a sibling admin page
 * (AdminAcceleratorSessionTimelinePage.smoke.test.tsx): `renderToStaticMarkup` never runs
 * `useEffect` (no commit phase in static rendering), so it never fires the real `api.get(...)`
 * calls this page makes on mount — it only proves the page's INITIAL render (before any drawer
 * data arrives) is safe: no crash from the new `drawerKind` union, the new body components
 * (CompositeDetailBody / ActivityDetailBody / BlockedWritesBody / AgentRegistryDetailBody /
 * DayDetailBody), or the new open* handlers being wired into JSX. This page owns its own data
 * fetch and has no route params, so `MemoryRouter` alone (no `<Routes>`) is enough context for
 * the `<Link>` used inside the agent drawer body.
 */

function renderPage() {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={['/admin/trust']}>
      <AdminTrustCenterPage />
    </MemoryRouter>,
  );
}

describe('AdminTrustCenterPage (Phase B drill-down wiring)', () => {
  it('renders its initial loading state without throwing', () => {
    expect(() => renderPage()).not.toThrow();
    const html = renderPage();
    expect(html).toContain('Loading Trust Command Center');
  });
});
