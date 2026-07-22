import React, { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

/**
 * "Management Portal" entry — an employee opens the admin portal from inside
 * their student session with no separate credentials. Mints a scoped admin
 * token via the bridge (POST /api/portal/mgmt/enter), stores it as the admin
 * session, and redirects into /admin (which the backend gates to their role's
 * sections). Non-mgmt students never see the link that leads here; the endpoint
 * also 403s them.
 */
export default function PortalMgmtEnterPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi.post<{ admin_token?: string }>('/api/portal/mgmt/enter')
      .then((res) => {
        const token = res.data?.admin_token;
        if (!token) { setError('You do not have management access.'); return; }
        localStorage.setItem('admin_token', token);
        window.location.replace('/admin');
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
