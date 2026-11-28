import React from 'react';
import { Route } from 'react-router-dom';
import { SCREENS } from './screens';
import PlaceholderScreen from './PlaceholderScreen';

/**
 * The Admissions & Ops child routes (AO1.4): one child route per screen, so a refresh keeps the screen.
 * routes/adminRoutes.tsx declares the parent literally, `<Route path="/admin/admissions-ops" element={<Layout />}>`,
 * because the Campus HQ drift guard reads that file for real admin routes; the 16 children live here because that
 * file is at the 500-line ceiling. A screen that is built for real replaces its placeholder here.
 * An unknown child path renders the not-found state inside the workspace.
 */
export function admissionsOpsChildRoutes(): React.ReactElement[] {
  return [
    ...SCREENS.map((s) => (s.path
      ? <Route key={s.id} path={s.path} element={<PlaceholderScreen id={s.id} />} />
      : <Route key={s.id} index element={<PlaceholderScreen id={s.id} />} />)),
    <Route key="not-found" path="*" element={<OpsNotFound />} />,
  ];
}

function OpsNotFound(): React.ReactElement {
  return (
    <div className="alert alert-secondary" role="status" data-testid="ops-not-found">
      This page is not part of the Admissions &amp; Ops workspace. Use the section bar to choose a screen.
    </div>
  );
}
