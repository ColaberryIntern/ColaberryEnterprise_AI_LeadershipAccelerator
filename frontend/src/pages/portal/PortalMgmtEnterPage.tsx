import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { allowedMgmtNext } from './mgmtNext';
import { mgmtBridgeBlockedReason } from './mgmtBridgeGate';

/**
 * "Management Portal" entry — an employee opens the admin portal from inside
 * their student session with no separate credentials. Mints a scoped admin
 * token via the bridge (POST /api/portal/mgmt/enter), stores it as the admin
 * session, and redirects into /admin (which the backend gates to their role's
 * sections). Non-mgmt students never see the link that leads here; the endpoint
 * also 403s them.
 *
 * C6: an optional ?next= sends them straight to one of three allowlisted admin pages (mgmtNext.ts). Anything else is
 * ignored and the landing is unchanged, so `next` cannot be used as an open redirect.
 *
 * AF2.7: refuses outright inside a read-only "View as member" tab. The nav no longer offers the
 * link there, so this is the belt for a same-tab navigation (a typed URL, a ?next= deep link, the
 * back button). It must come BEFORE the POST: `requireParticipant` would reject the request
 * anyway, but only with the generic read-only 403, which reads as a broken page rather than as
 * the deliberate refusal it is.
 */
export default function PortalMgmtEnterPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    const blocked = mgmtBridgeBlockedReason();
    if (blocked) { setError(blocked); return; }
    portalApi.post<{ admin_token?: string; role?: string }>('/api/portal/mgmt/enter')
      .then((res) => {
        const token = res.data?.admin_token;
        if (!token) { setError('You do not have management access.'); return; }
        localStorage.setItem('admin_token', token);
        // Support has no admin nav — only the read-only student-story surface —
        // so land them straight on it. Everyone else opens the admin dashboard.
        // NOTE: land on '/admin/dashboard', NOT '/admin' — the '/admin' index
        // route unconditionally redirects to '/admin/login', which would bounce
        // an already-authenticated bridge session back to a login prompt.
        const next = allowedMgmtNext(window.location.search);
        window.location.replace(next ?? (res.data?.role === 'support' ? '/admin/students' : '/admin/dashboard'));
      })
      .catch((e: any) => setError(e?.response?.data?.error || 'Could not open the management portal.'));
  }, []);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5 text-center">
          {error ? (
            <>
              <h2 className="h5 fw-semibold">Can’t open the management portal</h2>
              <p className="text-muted small">{error}</p>
              <a href="/portal/today" className="btn btn-sm btn-outline-secondary">Back to portal</a>
            </>
          ) : (
            <>
              <div className="spinner-border mb-3" style={{ color: '#FB2832' }} role="status">
                <span className="visually-hidden">Opening…</span>
              </div>
              <h2 className="h5 fw-semibold">Opening the Management Portal…</h2>
              <p className="text-muted small">Signing you in with your employee access.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
