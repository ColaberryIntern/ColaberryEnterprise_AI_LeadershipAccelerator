import React, { useState } from 'react';
import portalApi from '../../utils/portalApi';

// Participant Portal sign-in (magic-link request). Restyled onto the Colaberry
// Design System ("Design E", BC 10031928327): Quicksand wordmark with the cherry
// "C", radius-24 card + soft shadow, cherry pill action, leaf success state, DS
// focus rings. All values come from the global semantic tokens in
// src/colaberry/tokens/*.css — no hardcoded hex. Auth logic is unchanged.
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
      const res = await portalApi.post('/api/portal/request-link', { email });
      if (res.data.success === false) {
        setError(res.data.message || 'Unable to send access link.');
      } else {
        setSent(true);
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to send access link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="cbpl-root">
      <style>{CBPL_CSS}</style>

      <main className="cbpl-card">
        <div className="cbpl-brand">
          <img src="/colaberry-icon.png" alt="" width={38} height={38} className="cbpl-mark" />
          <span className="cbpl-wordmark" aria-hidden="true">
            <span className="cbpl-wordmark-c">C</span>olaberry
          </span>
        </div>

        {sent ? (
          <div className="cbpl-sent">
            <div className="cbpl-check" aria-hidden="true">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h1 className="cbpl-sent-title">Check your email</h1>
            <p className="cbpl-text">
              We sent a secure access link to <strong>{email}</strong>. Click it to sign in.
            </p>
            <p className="cbpl-text cbpl-text-sub">The link expires in 24 hours.</p>
            <button
              type="button"
              className="cbpl-linkbtn"
              onClick={() => { setSent(false); setEmail(''); }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div className="cbpl-head">
              <h1 className="cbpl-title">Participant Portal</h1>
              <p className="cbpl-text">
                Enter the email you enrolled with and we&rsquo;ll send you a secure sign-in link.
              </p>
            </div>

            <form className="cbpl-form" onSubmit={handleSubmit} noValidate>
              {error && (
                <div className="cbpl-error" role="alert">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4.5M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              <label htmlFor="email" className="cbpl-label">Email address</label>
              <input
                id="email"
                type="email"
                className="cbpl-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                autoComplete="email"
                inputMode="email"
              />

              <button type="submit" className="cbpl-btn" disabled={loading || !email}>
                {loading ? (
                  <><span className="cbpl-spin" aria-hidden="true" /> Sending&hellip;</>
                ) : (
                  'Send me an access link'
                )}
              </button>
            </form>
          </>
        )}

        <p className="cbpl-foot">Colaberry Enterprise AI Leadership Accelerator</p>
      </main>
    </div>
  );
}

const CBPL_CSS = `
.cbpl-root{
  min-height:100vh; min-height:100dvh;
  display:flex; align-items:center; justify-content:center;
  padding:24px;
  font-family:var(--font-body); color:var(--text-body);
  background:
    radial-gradient(1100px 460px at 50% -10%, color-mix(in srgb, var(--red-500) 9%, transparent), transparent 70%),
    radial-gradient(900px 420px at 100% 110%, color-mix(in srgb, var(--blue-500) 8%, transparent), transparent 72%),
    var(--surface-subtle);
}
.cbpl-card{
  width:100%; max-width:444px;
  background:var(--surface-card);
  border:1px solid var(--border-subtle);
  border-radius:var(--radius-xl);
  box-shadow:var(--shadow-xl);
  padding:40px 38px 30px;
}
@media (max-width:520px){ .cbpl-card{ padding:32px 22px 26px; } }

.cbpl-brand{ display:flex; align-items:center; justify-content:center; gap:10px; margin-bottom:28px; }
.cbpl-mark{ display:block; }
.cbpl-wordmark{
  font-family:var(--font-logo); font-weight:700; font-size:26px;
  letter-spacing:-.01em; color:var(--text-strong); line-height:1;
}
.cbpl-wordmark-c{ color:var(--brand-accent); }

.cbpl-head{ text-align:center; margin-bottom:24px; }
.cbpl-title{
  font-family:var(--font-display); font-weight:700; font-size:27px;
  letter-spacing:-.01em; color:var(--text-strong); margin:0 0 9px;
}
.cbpl-text{ font-size:15px; line-height:1.55; color:var(--text-muted); margin:0; }
.cbpl-text strong{ color:var(--text-body); font-weight:600; }
.cbpl-text-sub{ margin-top:6px; font-size:13.5px; color:var(--text-subtle); }

.cbpl-form{ margin-top:2px; }
.cbpl-label{
  display:block; font-size:13px; font-weight:600;
  color:var(--text-strong); margin-bottom:7px;
}
.cbpl-input{
  width:100%; height:50px; padding:0 15px;
  font-family:var(--font-body); font-size:15px; color:var(--text-strong);
  background:var(--surface-page);
  border:1px solid var(--border-default);
  border-radius:var(--radius-md);
  transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.cbpl-input::placeholder{ color:var(--text-subtle); }
.cbpl-input:focus{ outline:none; border-color:var(--border-focus); box-shadow:var(--focus-ring); }

.cbpl-btn{
  width:100%; height:50px; margin-top:20px;
  display:inline-flex; align-items:center; justify-content:center; gap:9px;
  font-family:var(--font-body); font-size:15px; font-weight:600;
  color:var(--action-fg); background:var(--action-bg);
  border:none; border-radius:var(--radius-pill); cursor:pointer;
  box-shadow:var(--shadow-brand);
  transition:background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
.cbpl-btn:hover:not(:disabled){ background:var(--action-bg-hover); transform:translateY(-1px); }
.cbpl-btn:active:not(:disabled){ background:var(--action-bg-press); transform:translateY(0); }
.cbpl-btn:focus-visible{ outline:none; box-shadow:var(--focus-ring); }
.cbpl-btn:disabled{ opacity:.55; cursor:not-allowed; box-shadow:none; }

.cbpl-error{
  display:flex; gap:9px; align-items:flex-start;
  font-size:13.5px; line-height:1.45; color:var(--status-danger);
  background:var(--status-danger-bg);
  border:1px solid color-mix(in srgb, var(--status-danger) 30%, transparent);
  border-radius:var(--radius-sm); padding:11px 13px; margin-bottom:18px;
}
.cbpl-error svg{ flex:0 0 auto; margin-top:1px; }

.cbpl-sent{ text-align:center; }
.cbpl-check{
  width:60px; height:60px; margin:2px auto 18px;
  display:flex; align-items:center; justify-content:center;
  border-radius:var(--radius-circle);
  background:var(--status-success-bg); color:var(--status-success);
}
.cbpl-sent-title{
  font-family:var(--font-display); font-weight:700; font-size:21px;
  color:var(--text-strong); margin:0 0 9px;
}
.cbpl-linkbtn{
  margin-top:16px; padding:6px 4px; background:none; border:none; cursor:pointer;
  font-family:var(--font-body); font-size:14px; font-weight:600;
  color:var(--text-link); text-decoration:underline; text-underline-offset:3px;
}
.cbpl-linkbtn:hover{ color:var(--text-link-hover); }
.cbpl-linkbtn:focus-visible{ outline:none; box-shadow:var(--focus-ring); border-radius:var(--radius-xs); }

.cbpl-spin{
  width:16px; height:16px; border-radius:50%;
  border:2px solid color-mix(in srgb, var(--action-fg) 40%, transparent);
  border-top-color:var(--action-fg);
  animation:cbpl-spin .7s linear infinite;
}
@keyframes cbpl-spin{ to{ transform:rotate(360deg); } }

.cbpl-foot{
  margin:26px 0 0; padding-top:18px;
  border-top:1px solid var(--border-subtle);
  text-align:center; font-size:12px; letter-spacing:.01em; color:var(--text-subtle);
}

@media (prefers-reduced-motion: reduce){
  .cbpl-btn, .cbpl-input{ transition:none; }
  .cbpl-btn:hover:not(:disabled){ transform:none; }
  .cbpl-spin{ animation-duration:1.5s; }
}
`;

export default PortalLoginPage;
