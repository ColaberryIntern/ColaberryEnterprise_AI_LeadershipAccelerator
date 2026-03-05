import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

function PortalLoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await portalApi.post('/api/portal/request-link', { email });
      setSent(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send access link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center" style={{ background: 'var(--color-bg-alt)' }}>
      <div className="card border-0 shadow-sm" style={{ maxWidth: 440, width: '100%' }}>
        <div className="card-body p-4 p-md-5">
          <div className="text-center mb-4">
            <h1 className="h4 fw-bold" style={{ color: 'var(--color-primary)' }}>Participant Portal</h1>
            <p className="text-muted small mb-0">Colaberry Enterprise AI Leadership Accelerator</p>
          </div>

          {sent ? (
            <div className="text-center">
              <div className="mb-3">
                <span className="d-inline-flex align-items-center justify-content-center rounded-circle" style={{ width: 56, height: 56, background: '#d4edda' }}>
                  <i className="bi bi-envelope-check" style={{ fontSize: 28, color: 'var(--color-accent)' }}></i>
                </span>
              </div>
              <h2 className="h5 fw-semibold">Check Your Email</h2>
              <p className="text-muted small">
                We sent an access link to <strong>{email}</strong>. Click the link in the email to sign in.
              </p>
              <p className="text-muted small">The link expires in 24 hours.</p>
              <button
                className="btn btn-outline-secondary btn-sm mt-2"
                onClick={() => { setSent(false); setEmail(''); }}
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-muted small text-center">Enter the email address you enrolled with to receive a secure access link.</p>
              {error && <div className="alert alert-danger small py-2">{error}</div>}
              <div className="mb-3">
                <label htmlFor="email" className="form-label small fw-medium">Email Address</label>
                <input
                  id="email"
                  type="email"
                  className="form-control"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-100"
                disabled={loading || !email}
                style={{ background: 'var(--color-primary)', borderColor: 'var(--color-primary)' }}
              >
                {loading ? (
                  <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Sending...</>
                ) : (
                  'Send Me an Access Link'
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default PortalLoginPage;
