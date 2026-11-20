import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { ClientStatus, getClientStatus, requestClientLink } from '../../services/enterpriseIntakeApi';
import './myPilot.css';

/**
 * /my-pilot - a client signs in by email link and sees where their pilot stands (W32, Phase 5).
 *
 *     "Eventually client login to enterprise"  (Ali, 2026-11-20)
 *
 * /my-pilot asks for their email and sends a link (the same answer whether or not we know the
 * address). /my-pilot/status?token=... shows their steps, dated, and what happens next. The
 * token is a 7-day signed link; when it has expired the page offers a new one.
 */

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }) : '';

function RequestLink({ expired }: { expired?: boolean }): React.ReactElement {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setState('error');
      return;
    }
    setState('sending');
    try {
      await requestClientLink(email.trim());
      setState('sent');
    } catch {
      setState('error');
    }
  };
  return (
    <div className="cbv2-mp__card" data-testid="mp-request">
      {expired ? <p className="cbv2-mp__warn">That link has expired. Ask for a new one below.</p> : null}
      {state === 'sent' ? (
        <p role="status" data-testid="mp-sent">
          If we have a pilot request for that email, a link is on its way. It works for 7 days.
        </p>
      ) : (
        <form onSubmit={submit} noValidate>
          <label htmlFor="mp-email">Your work email</label>
          <input id="mp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={state === 'error'} />
          {state === 'error' ? (
            <p className="cbv2-field5__err" role="alert">
              Please enter the email you used to book your demo pilot.
            </p>
          ) : null}
          <button className="cbv2-btn cbv2-btn--primary" type="submit" disabled={state === 'sending'}>
            {state === 'sending' ? 'Sending...' : 'Email me my link'}
          </button>
        </form>
      )}
      <p className="cbv2-mp__small">
        Have not booked yet? <Link to="/demo-pilot">Book a demo pilot</Link>.
      </p>
    </div>
  );
}

function Status({ token }: { token: string }): React.ReactElement {
  const [status, setStatus] = useState<ClientStatus | null>(null);
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    getClientStatus(token)
      .then(setStatus)
      .catch(() => setExpired(true));
  }, [token]);
  if (expired) return <RequestLink expired />;
  if (!status) return <p className="cbv2-mp__small">Loading your pilot...</p>;
  return (
    <div className="cbv2-mp__card" data-testid="mp-status">
      <h2 className="cbv2-mp__h2">
        {status.firstName ? `${status.firstName}, here` : 'Here'} is where your pilot for {status.company} stands.
      </h2>
      <ol className="cbv2-mp__steps">
        {status.steps.map((s) => (
          <li key={s.label} className={s.done ? 'is-done' : ''}>
            <span className="cbv2-mp__dot" aria-hidden="true" />
            <span>
              {s.label}
              {s.done && s.at ? <small> {day(s.at)}</small> : null}
              <span className="cbv2-sr-only">{s.done ? ' (done)' : ' (not yet)'}</span>
            </span>
          </li>
        ))}
      </ol>
      {status.options.length ? (
        <>
          <h3 className="cbv2-mp__h3">Your pilot options</h3>
          <ul className="cbv2-mp__options">
            {status.options.map((o) => (
              <li key={o}>{o}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="cbv2-mp__next">
        <strong>Next:</strong> {status.next}
      </p>
    </div>
  );
}

export function MyPilotV2(): React.ReactElement {
  const [params] = useSearchParams();
  // Read the sign-in token once, then take it out of the address bar, so a working 7-day
  // credential does not sit in browser history or get copied with the URL.
  const [token] = useState(() => params.get('token'));
  useEffect(() => {
    if (token && typeof window !== 'undefined' && window.location.search.includes('token=')) {
      window.history.replaceState(window.history.state, '', window.location.pathname);
    }
  }, [token]);
  return (
    <>
      <SeoV2 title="My pilot" description="See where your Colaberry pilot stands." />
      <section className="cbv2-prhero5 cbv2-mp" aria-labelledby="cbv2-mp-title">
        <div className="cbv2-wrap">
          <p className="cbv2-k5">Clients</p>
          <h1 id="cbv2-mp-title">My pilot</h1>
          {token ? <Status token={token} /> : <RequestLink />}
        </div>
      </section>
    </>
  );
}

export default MyPilotV2;
