import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import portalApi from '../../utils/portalApi';

function PortalVerifyPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useParticipantAuth();
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setError('No verification token provided.');
      setVerifying(false);
      return;
    }

    portalApi.get(`/api/portal/verify?token=${token}`)
      .then((res) => {
        login(res.data.jwt);
        // Land on Home — it routes first-run users to the build chooser (or the
        // live demo if a build is in flight) and existing users to the dashboard.
        // (Previously went to /portal/project → blueprint, which showed an empty
        // "nothing to execute" page to brand-new users.)
        navigate('/portal/home', { replace: true });
      })
      .catch((err) => {
        setError(err.response?.data?.error || 'Invalid or expired link. Please request a new one.');
        setVerifying(false);
      });
  }, [searchParams, login, navigate]);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5 text-center">
          {verifying && !error ? (
            <>
              <div className="spinner-border mb-3" style={{ color: '#FB2832' }} role="status">
                <span className="visually-hidden">Verifying...</span>
              </div>
              <h2 className="h5 fw-semibold">Verifying Your Access</h2>
              <p className="text-muted small">Please wait while we sign you in...</p>
            </>
          ) : (
            <>
              <div className="mb-3">
                <span className="d-inline-flex align-items-center justify-content-center rounded-circle" style={{ width: 56, height: 56, background: '#f8d7da' }}>
                  <i className="bi bi-exclamation-triangle" style={{ fontSize: 28, color: 'var(--color-secondary)' }}></i>
                </span>
              </div>
              <h2 className="h5 fw-semibold">Verification Failed</h2>
              <p className="text-muted small">{error}</p>
              <a href="/portal/login" className="btn btn-sm" style={{ background: '#FB2832', borderColor: '#FB2832', color: '#fff' }}>
                Request New Link
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default PortalVerifyPage;
