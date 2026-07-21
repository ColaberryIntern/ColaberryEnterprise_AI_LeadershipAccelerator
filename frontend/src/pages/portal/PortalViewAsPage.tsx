import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';

/**
 * Landing for admin "View as member" (read-only). The read_only participant JWT
 * arrives in the URL HASH (`#t=...`) — kept out of query strings / server logs /
 * referrers. We store it as the participant session (the server enforces
 * read-only), scrub it from the address bar, and drop into the member's Today.
 * The global ReadOnlyBanner then shows the read-only notice.
 */
export default function PortalViewAsPage() {
  const navigate = useNavigate();
  const { login } = useParticipantAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash || '';
    const match = hash.match(/(?:^#|&)t=([^&]+)/);
    const token = match ? decodeURIComponent(match[1]) : '';
    if (!token) {
      setError('No view-as token provided.');
      return;
    }
    login(token);
    // Scrub the token from the URL/history, then land on the member's Today.
    try { window.history.replaceState(null, '', '/portal/today'); } catch { /* non-fatal */ }
    navigate('/portal/today', { replace: true });
  }, [login, navigate]);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5 text-center">
          {error ? (
            <>
              <h2 className="h5 fw-semibold">Couldn’t open read-only view</h2>
              <p className="text-muted small">{error}</p>
            </>
          ) : (
            <>
              <div className="spinner-border mb-3" style={{ color: '#7c2d12' }} role="status">
                <span className="visually-hidden">Opening…</span>
              </div>
              <h2 className="h5 fw-semibold">Opening read-only view…</h2>
              <p className="text-muted small">Loading this member’s portal.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
