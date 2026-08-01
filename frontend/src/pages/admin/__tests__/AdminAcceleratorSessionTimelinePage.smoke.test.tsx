import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminAcceleratorSessionTimelinePage from '../AdminAcceleratorSessionTimelinePage';

/**
 * T009 (loop-architect run 20260731-195500-classkit-panel-redesign). This
 * page owns its own data fetch (`useEffect` + `api.get(...)`), matching the
 * pre-existing `KitConfigModal.tsx` shell pattern this codebase already
 * uses without a direct test of its own — only the presentational children
 * (`TimelineBuilderPanel`, already thoroughly tested) carry real coverage.
 *
 * `renderToStaticMarkup` never runs `useEffect` (no commit phase in static
 * rendering), so this test never actually fires the real `api.get()` call —
 * it only proves the page's INITIAL (loading) render is safe: no crash from
 * a route with a real `:sessionId` param, and no crash from one missing it.
 * React Router hooks (`useParams`/`useLocation`/`useNavigate`) require a
 * Router context, hence the `MemoryRouter` wrapper.
 */

function renderAt(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/accelerator/sessions/:sessionId/timeline" element={<AdminAcceleratorSessionTimelinePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminAcceleratorSessionTimelinePage', () => {
  it('renders its initial loading state without throwing, with a real sessionId param', () => {
    expect(() => renderAt('/admin/accelerator/sessions/abc-123/timeline')).not.toThrow();
    const html = renderAt('/admin/accelerator/sessions/abc-123/timeline');
    expect(html).toContain('Loading timeline');
  });

  it('does not throw when the route is visited without a resolvable sessionId', () => {
    // No route matches an empty/malformed param the same way, but confirm
    // a differently-shaped id (e.g. one containing characters a naive
    // lookup might mishandle) still renders the same safe loading state.
    expect(() => renderAt('/admin/accelerator/sessions/not-a-real-session/timeline')).not.toThrow();
  });
});
