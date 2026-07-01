import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useParticipantAuth } from '../../contexts/ParticipantAuthContext';
import { freeSignup } from '../../services/onboardingApi';

// Public "Sign up free" front door. Creates a free guest account (0 points),
// logs the visitor straight in, and drops them on the Today shell — the top of
// the onboarding funnel. Styled onto the Colaberry Design System to match
// PortalLoginPage (self-contained scoped `cbfs-*` classes).
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function PortalFreeSignupPage() {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useParticipantAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) { setError('Please enter your name.'); return; }
    if (!EMAIL_RE.test(email.trim())) { setError('Please enter a valid email.'); return; }
    setLoading(true);
    try {
      const res = await freeSignup({ full_name: fullName.trim(), email: email.trim() });
      login(res.jwt);
      navigate('/portal/today', { replace: true });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not create your account. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="cbfs-root">
      <style>{CBFS_CSS}</style>
      <main className="cbfs-card">
        <div className="cbfs-brand">
          <img src="/colaberry-icon.png" alt="" width={38} height={38} className="cbfs-mark" />
          <span className="cbfs-wordmark" aria-hidden="true"><span className="cbfs-c">C</span>olaberry</span>
        </div>

        <div className="cbfs-head">
          <span className="cbfs-badge">Free preview</span>
          <h1 className="cbfs-title">Start free</h1>
          <p className="cbfs-text">
            Create a free account to explore the AI Systems Architect Accelerator, RSVP to the next open house,
            and see your project take shape. No payment required.
          </p>
        </div>

        <form className="cbfs-form" onSubmit={handleSubmit}>
          <label className="cbfs-label" htmlFor="cbfs-name">Full name</label>
          <input
            id="cbfs-name" className="cbfs-input" type="text" autoComplete="name"
            placeholder="Your name" value={fullName} onChange={(e) => setFullName(e.target.value)}
            disabled={loading}
          />
          <label className="cbfs-label" htmlFor="cbfs-email">Email</label>
          <input
            id="cbfs-email" className="cbfs-input" type="email" autoComplete="email"
            placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          {error && <div className="cbfs-error" role="alert">{error}</div>}
          <button className="cbfs-btn" type="submit" disabled={loading}>
            {loading ? 'Creating your account…' : 'Create my free account'}
          </button>
        </form>

        <p className="cbfs-foot">
          Already enrolled? <Link className="cbfs-link" to="/portal/login">Sign in</Link>
        </p>
      </main>
    </div>
  );
}

const CBFS_CSS = `
.cbfs-root{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
  background:#F8F8F7;font-family:'Roboto',system-ui,-apple-system,'Segoe UI',sans-serif;color:#2B2B2B}
.cbfs-card{width:100%;max-width:440px;background:#fff;border:1px solid #E4E4E3;border-radius:24px;
  box-shadow:0 12px 30px rgba(26,26,26,.10),0 3px 8px rgba(26,26,26,.06);padding:34px 32px}
.cbfs-brand{display:flex;align-items:center;gap:11px;margin-bottom:22px}
.cbfs-mark{border-radius:9px;display:block}
.cbfs-wordmark{font-family:'Quicksand',system-ui,sans-serif;font-weight:700;font-size:22px;color:#1A1A1A}
.cbfs-c{color:#FB2832}
.cbfs-head{margin-bottom:20px}
.cbfs-badge{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;
  color:#B5710A;background:rgba(232,146,12,.16);border-radius:999px;padding:4px 11px;margin-bottom:10px}
.cbfs-title{font-size:27px;font-weight:700;color:#1A1A1A;margin:0 0 8px;letter-spacing:-.01em}
.cbfs-text{font-size:14.5px;color:#6B6B6B;line-height:1.55;margin:0}
.cbfs-form{display:flex;flex-direction:column;margin-top:8px}
.cbfs-label{font-size:13px;font-weight:700;color:#2B2B2B;margin:12px 0 6px}
.cbfs-input{border:1px solid #D8D8D8;border-radius:12px;padding:12px 15px;font-size:15px;font-family:inherit;
  background:#fff;color:#2B2B2B;outline:none;transition:border-color .15s,box-shadow .15s}
.cbfs-input:focus{border-color:#367895;box-shadow:0 0 0 3px rgba(54,120,149,.22)}
.cbfs-input:disabled{background:#F1F1F0}
.cbfs-error{margin-top:12px;font-size:13.5px;color:#C20E1E;background:rgba(251,40,50,.08);
  border:1px solid rgba(251,40,50,.28);border-radius:10px;padding:9px 12px}
.cbfs-btn{margin-top:18px;background:#FB2832;color:#fff;border:none;border-radius:999px;padding:13px 22px;
  font-size:15px;font-weight:700;font-family:inherit;cursor:pointer;transition:filter .15s}
.cbfs-btn:hover:not(:disabled){filter:brightness(.95)}
.cbfs-btn:disabled{opacity:.6;cursor:default}
.cbfs-foot{margin:20px 0 0;text-align:center;font-size:14px;color:#6B6B6B}
.cbfs-link{color:#2E6A86;font-weight:700;text-decoration:none}
.cbfs-link:hover{text-decoration:underline}
`;

export default PortalFreeSignupPage;
