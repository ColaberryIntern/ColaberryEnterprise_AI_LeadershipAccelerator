import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAlumniAuth } from '../../contexts/AlumniAuthContext';
import MayaChatWidget from '../../components/MayaChatWidget';

const DARK = {
  bg: '#0f1219',
  bgCard: '#1a1f2e',
  border: '#2d3748',
  text: '#e2e8f0',
  textMuted: '#a0aec0',
  accent: '#90cdf4',
  accentHover: '#63b3ed',
  navy: '#1a365d',
};

function ReferralLoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { login } = useAlumniAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError('Please enter your alumni email.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const baseURL = process.env.REACT_APP_API_URL || '';
      const res = await axios.post(`${baseURL}/api/referrals/login`, { email: email.trim().toLowerCase() });
      login(res.data.token, res.data.profile);
      navigate('/referrals/dashboard', { replace: true });
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('This email was not found in our alumni database. Please use the email you registered with at Colaberry.');
      } else {
        setError(err.response?.data?.error || 'Unable to verify your account. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ backgroundColor: DARK.bg, minHeight: '100vh' }} className="d-flex align-items-center justify-content-center">
      <div style={{ maxWidth: 440, width: '100%' }} className="px-3">
        {/* Header */}
        <div className="text-center mb-4">
          <h2 className="fw-bold mb-2" style={{ color: DARK.text }}>AI Champion Network</h2>
          <p style={{ color: DARK.textMuted }}>
            As a Colaberry graduate, activate your account to start earning $250 for every leader you refer to our Enterprise AI Leadership Accelerator.
          </p>
        </div>

        {/* Login Card */}
        <div
          className="p-4 rounded-3"
          style={{ backgroundColor: DARK.bgCard, border: `1px solid ${DARK.border}` }}
        >
          <h5 className="fw-semibold mb-3" style={{ color: DARK.text }}>Activate My Referral Account</h5>

          {error && (
            <div className="alert alert-danger py-2 small">{error}</div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label className="form-label small" style={{ color: DARK.textMuted }}>
                Alumni Email Address
              </label>
              <input
                type="email"
                className="form-control"
                style={{
                  backgroundColor: DARK.bg,
                  border: `1px solid ${DARK.border}`,
                  color: DARK.text,
                }}
                placeholder="your.email@company.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                required
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn w-100 fw-semibold"
              style={{
                backgroundColor: DARK.accent,
                color: DARK.navy,
                border: 'none',
              }}
              disabled={loading}
            >
              {loading ? 'Verifying...' : 'Activate & Log In'}
            </button>
          </form>

          <p className="text-center mt-3 mb-0 small" style={{ color: DARK.textMuted }}>
            We verify your email against the Colaberry alumni database. No password needed.
          </p>
        </div>

        {/* Back link */}
        <div className="text-center mt-3">
          <a
            href="/alumni-ai-champion"
            className="small"
            style={{ color: DARK.accent, textDecoration: 'none' }}
          >
            Back to Alumni AI Champion page
          </a>
        </div>
      </div>
      <MayaChatWidget />
    </div>
  );
}

export default ReferralLoginPage;
