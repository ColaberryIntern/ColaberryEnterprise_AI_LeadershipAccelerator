import React, { useEffect, useState } from 'react';
import portalApi from '../utils/portalApi';
import { isReadOnlyParticipantSession } from '../utils/participantToken';
import { PHONE_CONSENT_TEXT } from '../config/consentText';
import { phoneProblem } from '../utils/phone';

/**
 * The blocking "Add your phone" step (PH1, Ali 2026-11-19: a logged-in portal user with no phone
 * on file must add one to continue; no skip).
 *
 * Wraps every authenticated portal page (it sits in PortalProtectedRoute). It asks the SERVER
 * whether this session must add a number - `GET /api/portal/phone-gate` answers booleans only,
 * never the number, and already says "not required" for staff and for an admin's read-only
 * "View as" session. This component also skips the question outright in a read-only tab, so a
 * preview is never blocked and never offered a write.
 *
 * FAILS OPEN. If the check itself fails, the portal renders as before: an outage in this one
 * endpoint must not lock every student out of their classes.
 *
 * The number is required; permission to call or text it is NOT. The box is always shown,
 * unticked, and saving never depends on it.
 */

type GateState = 'checking' | 'required' | 'clear';

export function PhoneGateForm({ onSaved }: { onSaved: () => void }): React.ReactElement {
  const [phone, setPhone] = useState('');
  const [phoneConsent, setPhoneConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const problem = phoneProblem(phone);
    if (problem) { setError(problem); return; }
    setSaving(true);
    try {
      await portalApi.put('/api/portal/phone', { phone: phone.trim(), phone_consent: phoneConsent });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'We could not save that number. Please try again.');
      setSaving(false);
    }
  };

  return (
    <div style={WRAP} data-testid="portal-phone-gate">
      <form style={CARD} onSubmit={submit} noValidate aria-labelledby="pg-title">
        <h1 id="pg-title" style={TITLE}>Add your phone number</h1>
        <p style={SUB}>
          We need a phone number on your account so we can reach you about your program,
          your classes and events. It takes a few seconds.
        </p>
        <label htmlFor="pg-phone" style={LABEL}>Phone number</label>
        <input
          id="pg-phone" type="tel" inputMode="tel" autoComplete="tel" required
          placeholder="(555) 555-5555" value={phone} disabled={saving}
          onChange={(e) => setPhone(e.target.value)} style={INPUT}
          aria-invalid={Boolean(error)} aria-describedby={error ? 'pg-error' : undefined}
        />
        <label htmlFor="pg-phone-consent" style={CONSENT}>
          <input
            id="pg-phone-consent" type="checkbox" checked={phoneConsent} disabled={saving}
            onChange={(e) => setPhoneConsent(e.target.checked)} style={{ marginTop: 3, flexShrink: 0 }}
          />
          <span>{PHONE_CONSENT_TEXT}</span>
        </label>
        {error && <div id="pg-error" role="alert" style={ERROR}>{error}</div>}
        <button type="submit" disabled={saving} style={BUTTON}>
          {saving ? 'Saving…' : 'Save and continue'}
        </button>
      </form>
    </div>
  );
}

export default function PortalPhoneGate({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const readOnly = isReadOnlyParticipantSession();
  const [state, setState] = useState<GateState>(readOnly ? 'clear' : 'checking');

  useEffect(() => {
    if (readOnly) { setState('clear'); return undefined; }
    let alive = true;
    portalApi.get<{ has_phone: boolean; required: boolean }>('/api/portal/phone-gate')
      .then(({ data }) => { if (alive) setState(data?.required === true ? 'required' : 'clear'); })
      .catch(() => { if (alive) setState('clear'); });
    return () => { alive = false; };
  }, [readOnly]);

  if (state === 'checking') return null;
  if (state === 'required') return <PhoneGateForm onSaved={() => setState('clear')} />;
  return <>{children}</>;
}

const WRAP: React.CSSProperties = {
  minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 16, background: '#F8F8F7', fontFamily: "'Roboto', system-ui, -apple-system, 'Segoe UI', sans-serif",
  color: '#2B2B2B',
};
const CARD: React.CSSProperties = {
  width: '100%', maxWidth: 440, background: '#fff', border: '1px solid #E4E4E3', borderRadius: 24,
  boxShadow: '0 12px 30px rgba(26,26,26,.10), 0 3px 8px rgba(26,26,26,.06)', padding: '32px 28px',
};
const TITLE: React.CSSProperties = { fontSize: 24, fontWeight: 800, margin: '0 0 8px', color: '#1A1A1A' };
const SUB: React.CSSProperties = { fontSize: 15, lineHeight: 1.5, margin: '0 0 20px', color: '#4A4A4A' };
const LABEL: React.CSSProperties = { display: 'block', fontSize: 14, fontWeight: 700, marginBottom: 6 };
const INPUT: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16, border: '1px solid #D8D8D8',
  borderRadius: 12, marginBottom: 14,
};
const CONSENT: React.CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: '#5A5A5A',
  cursor: 'pointer', marginBottom: 16,
};
const ERROR: React.CSSProperties = { color: '#C20E1E', fontSize: 14, fontWeight: 600, marginBottom: 12 };
const BUTTON: React.CSSProperties = {
  width: '100%', padding: '13px 16px', fontSize: 16, fontWeight: 700, color: '#fff', background: '#FB2832',
  border: 'none', borderRadius: 999, cursor: 'pointer',
};
