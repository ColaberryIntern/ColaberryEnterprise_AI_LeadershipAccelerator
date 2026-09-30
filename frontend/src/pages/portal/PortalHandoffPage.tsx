import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { exchangePhoneHandoff } from '../../services/onboardingApi';

// Landing page for the "Open on your phone" QR handoff. The phone trades the
// one-time code (?t=) for a session JWT, stores it, and lands on Today — already
// signed in. Mirrors PortalVerifyPage; the code is single-use, so a ref guard
// prevents a double-exchange (e.g. React StrictMode's dev double-invoke) from
// burning the token on the second call and showing a false "expired".
const PortalHandoffPage: React.FC = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useParticipantAuth();
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = params.get('t');
    if (!token) {
      setError('This link is missing its code. Open a fresh one on your computer.');
      return;
    }
    exchangePhoneHandoff(token)
      .then((jwt) => {
        login(jwt);
        navigate('/portal/today', { replace: true });
      })
      .catch(() => setError('This code has expired. Open a fresh one on your computer and scan again.'));
  }, [params, login, navigate]);

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5 text-center">
          {!error ? (
            <>
              <div className="spinner-border mb-3" style={{ color: '#FB2832' }} role="status">
                <span className="visually-hidden">Signing you in…</span>
              </div>
              <h2 className="h5 fw-semibold">Opening Today on your phone</h2>
              <p className="text-muted small">Signing you in…</p>
            </>
          ) : (
            <>
              <div className="mb-3">
                <span className="d-inline-flex align-items-center justify-content-center rounded-circle" style={{ width: 56, height: 56, background: '#f8d7da' }}>
                  <i className="bi bi-exclamation-triangle" style={{ fontSize: 28, color: 'var(--color-secondary)' }}></i>
                </span>
              </div>
              <h2 className="h5 fw-semibold">This code expired</h2>
              <p className="text-muted small">{error}</p>
              <a href="/portal/login" className="btn btn-sm" style={{ background: '#FB2832', borderColor: '#FB2832', color: '#fff' }}>
                Go to sign in
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default PortalHandoffPage;
