import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ClientSignIn — the door for an external client reviewer.
 *
 * ## Magic link is the primary door, not Google
 *
 * Ali: *"what if the client don't have a gmail account"* — and then *"let's just keep with
 * the magic link since that's what we are using for B2C and B2B."*
 *
 * Google Sign-In assumes a Google account. The executives this surface serves are
 * overwhelmingly Microsoft 365 shops, and their IT frequently blocks creating one, so
 * Google was the door convenient for **us** rather than the one that opens for **them**.
 * A magic link works for any email address, with no account anywhere. Google remains as
 * an optional convenience where `REACT_APP_GOOGLE_CLIENT_ID` is configured; it is never
 * the only way in.
 *
 * ## Signing in still grants nothing
 *
 * Redeeming a link proves control of a mailbox. The backend then requires a delivery
 * membership that **already exists**, exactly as it did for Google — so a valid link for
 * an address with no membership yields no session. The identity proof changed; the
 * authorization model did not.
 *
 * ## What this page deliberately does not do
 *
 * It does not tell the visitor **why** anything failed. The backend returns one message
 * for every refusal, because distinguishing them would let anyone discover who reviews
 * which engagement. This component renders those messages verbatim and adds nothing.
 *
 * It also does not confirm whether an address has access. Requesting a link always says
 * the same thing — that uniformity is the security property, and softening it here to
 * feel more helpful would undo it.
 */

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: any;
  }
}

export interface ClientSignInProps {
  /** Injected so tests and Storybook never touch Google. */
  clientId?: string;
  onSignedIn?: (token: string, projects: string[]) => void;
}

const ClientSignIn: React.FC<ClientSignInProps> = ({ clientId, onSignedIn }) => {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [redeeming, setRedeeming] = useState(false);

  const resolvedClientId = clientId ?? (process.env.REACT_APP_GOOGLE_CLIENT_ID || '');

  /** Store the session and go where the reviewer expects. Shared by both doors. */
  const acceptSession = useCallback(
    (body: { token: string; projects?: string[] }) => {
      try {
        window.localStorage.setItem('delivery_client_token', body.token);
      } catch {
        /* private browsing — the caller still gets the token below */
      }
      onSignedIn?.(body.token, body.projects ?? []);
      // Default destination when no handler is supplied, which is the real route's case.
      // Without it a successful sign-in stored a token and visibly did nothing.
      if (!onSignedIn) window.location.assign('/client/projects');
    },
    [onSignedIn],
  );

  /** Redeem a token arriving in the URL from an emailed link. */
  const redeem = useCallback(
    async (token: string) => {
      setRedeeming(true);
      setError(null);
      try {
        const res = await fetch('/api/refactored/client/auth/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(body?.error ?? 'That sign-in link is no longer valid.');
          return;
        }
        acceptSession(body);
      } catch {
        setError('Sign-in was not successful. Please try again.');
      } finally {
        setRedeeming(false);
      }
    },
    [acceptSession],
  );

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get('token');
    if (!token) return;

    // Strip the token from the address bar before doing anything with it. A magic link
    // left in the URL ends up in browser history, in a screenshot, and in the referer of
    // the next request — and it is a live credential until redeemed.
    window.history.replaceState({}, '', window.location.pathname);
    void redeem(token);
  }, [redeem]);

  async function requestLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch('/api/refactored/client/auth/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const body = await res.json().catch(() => ({}));
      // Rendered verbatim, including when nothing was sent. The server answers the same
      // way for an address with access and one without, and saying anything more specific
      // here would reintroduce exactly the disclosure it avoids.
      setNotice(
        body?.message ??
          'If that address has access to a review, a sign-in link is on its way.',
      );
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function exchangeGoogle(idToken: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/refactored/client/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error ?? 'Sign-in was not successful.');
        return;
      }
      acceptSession(body);
    } catch {
      setError('Sign-in was not successful. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!resolvedClientId || !buttonRef.current) return;

    // Typed lookup. A bare `querySelector` returns `Element`, which has no `src`/`async`/
    // `defer`/`onload` — and casting that away would hide a genuine mistake if the
    // selector ever matched something that is not a script tag.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GOOGLE_SCRIPT}"]`,
    );
    let cancelled = false;

    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !buttonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: resolvedClientId,
        callback: (response: { credential?: string }) => {
          if (response?.credential) void exchangeGoogle(response.credential);
        },
      });
      window.google.accounts.id.renderButton(buttonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 280,
      });
    };

    if (existing) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.onload = init;
      document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
    };
    // No eslint-disable here, deliberately. `exchangeGoogle` is intentionally absent from
    // the deps - re-running this effect would re-render Google's button. But a disable
    // comment naming `react-hooks/exhaustive-deps` is itself the error in this project
    // ("Definition for rule ... was not found"), and `CI=true` promotes it to a failed
    // build. CRA does not register the react-hooks rules here, so the rule cannot fire
    // and there is nothing to suppress. Same trap as `useCountUp.ts`.
  }, [resolvedClientId]);

  if (redeeming) {
    return (
      <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center py-5">
        <div className="text-muted small" role="status">
          Signing you in…
        </div>
      </div>
    );
  }

  return (
    <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center py-5">
      <div className="card border-0 shadow-sm" style={{ maxWidth: 420, width: '100%' }}>
        <div className="card-body p-4">
          <h1 className="h5 mb-2 text-center">Client review sign-in</h1>
          <p className="text-muted small mb-4 text-center">
            Enter the email address your Colaberry contact invited. We will send you a
            sign-in link. You will see only the projects you have been added to.
          </p>

          <form onSubmit={requestLink} className="mb-3">
            <label className="form-label small fw-medium" htmlFor="client-email">
              Email address
            </label>
            <input
              id="client-email"
              type="email"
              required
              autoComplete="email"
              className="form-control form-control-sm mb-3"
              placeholder="you@company.com"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
            <button type="submit" className="btn btn-primary btn-sm w-100" disabled={busy}>
              {busy ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>

          {notice && (
            <div className="alert alert-success small mb-3" role="status">
              {notice}
            </div>
          )}

          {resolvedClientId && (
            <>
              <div className="text-center text-muted small my-3">or</div>
              <div ref={buttonRef} className="d-flex justify-content-center mb-3" />
            </>
          )}

          {error && (
            <div className="alert alert-danger small mb-0" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientSignIn;
