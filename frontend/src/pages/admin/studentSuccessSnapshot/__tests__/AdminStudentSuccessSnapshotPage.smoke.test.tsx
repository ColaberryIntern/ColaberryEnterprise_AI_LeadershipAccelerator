import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import AdminStudentSuccessSnapshotPage from '../AdminStudentSuccessSnapshotPage';

/**
 * This page owns its own data fetch (`useEffect` + fetchStudentSuccessSnapshot).
 * `renderToStaticMarkup` never runs `useEffect` (no commit phase in static
 * rendering), so this only proves the page's initial (loading) render is safe
 * with a real `:id` route param — matches
 * AdminAcceleratorSessionTimelinePage.smoke.test.tsx's own established pattern.
 */
function renderAt(path: string) {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin/accelerator/enrollments/:id/success-snapshot" element={<AdminStudentSuccessSnapshotPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminStudentSuccessSnapshotPage', () => {
  it('renders its initial loading state without throwing, with a real enrollment id param', () => {
    expect(() => renderAt('/admin/accelerator/enrollments/abc-123/success-snapshot')).not.toThrow();
    const html = renderAt('/admin/accelerator/enrollments/abc-123/success-snapshot');
    expect(html).toContain('Loading student success snapshot');
  });

  it('does not throw for a differently-shaped id', () => {
    expect(() => renderAt('/admin/accelerator/enrollments/not-a-real-id/success-snapshot')).not.toThrow();
  });
});
