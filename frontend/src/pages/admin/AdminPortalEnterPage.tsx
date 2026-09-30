import React, { useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * "AI Training" entry — a staff member opens their OWN student portal account
 * from inside their admin session with no separate credentials. Mints a
 * full-access participant token via the bridge (POST /api/admin/portal/enter),
 * stores it as the portal session, and redirects into /portal/today. Reverse
 * of PortalMgmtEnterPage. Non-mgmt admins never see the link that leads here;
 * the endpoint also 403s them.
 */
export default function AdminPortalEnterPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    api.post<{ portal_token?: string }>('/api/admin/portal/enter')
      .then((res) => {
        const token = res.data?.portal_token;
        if (!token) { setError('No connected student portal for this account.'); return; }
        localStorage.setItem('participant_token', token);
        localStorage.removeItem('te_avatar');
        window.location.replace('/portal/today');
      })
      .catch((e: any) => setError(e?.response?.data?.error || 'Could not open AI Training.'));
  }, []);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5 text-center">
          {error ? (
            <>
              <h2 className="h5 fw-semibold">Can’t open AI Training</h2>
              <p className="text-muted small">{error}</p>
              <a href="/admin/dashboard" className="btn btn-sm btn-outline-secondary">Back to admin</a>
            </>
          ) : (
            <>
              <div className="spinner-border mb-3" style={{ color: '#FB2832' }} role="status">
                <span className="visually-hidden">Opening…</span>
              </div>
              <h2 className="h5 fw-semibold">Opening AI Training…</h2>
              <p className="text-muted small">Signing you in with your student access.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
