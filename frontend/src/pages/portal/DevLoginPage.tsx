import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import portalApi from '../../utils/portalApi';

interface DevAccount {
  id: string;
  full_name: string;
  email: string;
}

// Local-dev-only one-click login for seeded @localdev.test accounts. Exists
// so testing a two-account flow (DMs, presence) never depends on copying the
// right verify-link token into the right browser tab — click a name, you're
// that person. Backend 404s this whole surface outside development, so this
// page just renders "not available" there.
function DevLoginPage() {
  const navigate = useNavigate();
  const { login } = useParticipantAuth();
  const [accounts, setAccounts] = useState<DevAccount[] | null>(null);
  const [error, setError] = useState('');
  const [loggingInAs, setLoggingInAs] = useState<string | null>(null);

  useEffect(() => {
    portalApi.get<{ accounts: DevAccount[] }>('/api/portal/dev/test-accounts')
      .then((res) => setAccounts(res.data.accounts))
      .catch(() => setError('Not available (this only works against a local dev backend).'));
  }, []);

  const loginAs = (account: DevAccount) => {
    setLoggingInAs(account.id);
    portalApi.post<{ jwt: string }>('/api/portal/dev/login-as', { enrollmentId: account.id })
      .then((res) => {
        login(res.data.jwt);
        navigate('/portal/today', { replace: true });
      })
      .catch(() => {
        setError(`Could not log in as ${account.full_name}.`);
        setLoggingInAs(null);
      });
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-light">
      <div className="card border-0 shadow-sm" style={{ maxWidth: 420, width: '100%' }}>
        <div className="card-body p-4 p-md-5">
          <h1 className="h5 fw-semibold mb-1">Dev test-account login</h1>
          <p className="text-muted small mb-4">Local dev only — click an account to log in as them.</p>

          {error && <div className="alert alert-danger py-2 small">{error}</div>}

          {!accounts && !error && <div className="text-muted small">Loading accounts…</div>}

          {accounts && accounts.length === 0 && (
            <div className="text-muted small">No @localdev.test accounts seeded in this environment.</div>
          )}

          <div className="d-grid gap-2">
            {accounts?.map((a) => (
              <button
                key={a.id}
                type="button"
                className="btn btn-outline-secondary text-start d-flex justify-content-between align-items-center"
                disabled={loggingInAs !== null}
                onClick={() => loginAs(a)}
              >
                <span>
                  <strong>{a.full_name}</strong>
                  <br />
                  <span className="text-muted small">{a.email}</span>
                </span>
                {loggingInAs === a.id && <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DevLoginPage;
