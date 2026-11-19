import React, { useState } from 'react';

/**
 * Name + email check-in, for anyone on the class QR who is not a signed-in member of the
 * class (Ali, 2026-11-19: "They should get name and email here for tracking").
 *
 * Deliberately not a sign-in: no password, no emailed link to wait for, nothing sent to the
 * address at all. The email is matched to an enrollment server-side for the attendance
 * record and grants nothing else.
 */
interface Props {
  /** Why they are seeing the form — shown above it. */
  lead: string;
  initialName?: string;
  initialEmail?: string;
  submitLabel: string;
  onSubmit: (name: string, email: string) => Promise<void>;
  /** Shown under the form for signed-out visitors: enrolled students can still sign in. */
  loginHref?: string;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The server's own message when it gave one (e.g. "This class has already ended"). */
function messageFrom(err: unknown): string {
  const e = err as { response?: { data?: { error?: unknown } } };
  const msg = e?.response?.data?.error;
  if (typeof msg === 'string' && msg) return msg;
  return e?.response ? 'That did not go through. Try again.' : 'No connection. Try again.';
}

const CheckinGuestForm: React.FC<Props> = ({ lead, initialName = '', initialEmail = '', submitLabel, onSubmit, loginHref }) => {
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (busy) return;
    const n = name.trim();
    const e = email.trim();
    if (!n) { setErr('Enter your name.'); return; }
    if (!EMAIL_SHAPE.test(e)) { setErr('Enter a valid email.'); return; }
    setErr('');
    setBusy(true);
    onSubmit(n, e)
      .catch((x) => setErr(messageFrom(x)))
      .finally(() => setBusy(false));
  };

  return (
    <form className="cbck-form" onSubmit={submit} noValidate data-testid="checkin-guest-form">
      <p className="cbck-text cbck-text-lead" style={{ textAlign: 'center' }}>{lead}</p>
      <label className="cbck-label" htmlFor="cbck-name">Your name</label>
      <input
        id="cbck-name" className="cbck-input" name="name" autoComplete="name" maxLength={100}
        placeholder="First and last name" value={name} onChange={(ev) => setName(ev.target.value)}
        data-testid="checkin-guest-name"
      />
      <label className="cbck-label" htmlFor="cbck-email">Email</label>
      <input
        id="cbck-email" className="cbck-input" name="email" type="email" autoComplete="email" inputMode="email" maxLength={254}
        placeholder="you@example.com" value={email} onChange={(ev) => setEmail(ev.target.value)}
        data-testid="checkin-guest-email"
      />
      <button type="submit" className="cbck-btn" disabled={busy} data-testid="checkin-guest-submit">
        {busy ? 'Checking you in…' : submitLabel}
      </button>
      <p className="cbck-form-err" role="alert" data-testid="checkin-guest-error">{err}</p>
      {loginHref && (
        <p className="cbck-signin-alt" style={{ textAlign: 'center' }}>
          Enrolled with a Colaberry account? <a href={loginHref} data-testid="checkin-login">Log in instead</a>
        </p>
      )}
    </form>
  );
};

export default CheckinGuestForm;
