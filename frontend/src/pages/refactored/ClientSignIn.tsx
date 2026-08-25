import React, { useEffect, useRef, useState } from 'react';

/**
 * ClientSignIn — the door for an external client reviewer.
 *
 * Google SSO, per master plan §12's rule that no separate Refactored credential store may
 * exist. This page collects a Google ID token and exchanges it at
 * `POST /api/refactored/client/auth/google`; the backend decides everything else.
 *
 * ## What this page deliberately does not do
 *
 * It does not tell the visitor **why** a sign-in failed. The backend returns one uniform
 * message for "no such identity", "unverified email" and "no delivery membership", because
 * distinguishing them would let anyone with a Google account discover who has access to
 * which client project. This component renders that message verbatim and adds nothing.
 *
 * It also does not offer a "request access" flow. Access is granted by someone adding a
 * reviewer to a project — an on-page request would imply signing in can lead to access,
 * which is exactly the expectation the backend refuses.
 *
 * ## Not yet verified visually
 *
 * Rendered by nothing yet — this page ships ahead of its route so the sign-in model can be
 * reviewed. It compiles and type-checks; that is a different claim from working.
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
  const [busy, setBusy] = useState(false);

  const resolvedClientId = clientId ?? (process.env.REACT_APP_GOOGLE_CLIENT_ID || '');

  async function exchange(idToken: string) {
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
        // Rendered verbatim. The backend deliberately returns one message for every
        // refusal; embellishing it here would undo that.
        setError(body?.error ?? 'Sign-in was not successful.');
        return;
      }

      try {
        window.localStorage.setItem('delivery_client_token', body.token);
      } catch {
        /* private browsing — the caller still gets the token below */
      }
      onSignedIn?.(body.token, body.projects ?? []);
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
          if (response?.credential) void exchange(response.credential);
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
      // Already loaded by a previous mount — initialise against the existing script rather
      // than injecting a second copy of Google's library.
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
    // No eslint-disable here, deliberately. `exchange` and `onSignedIn` are intentionally
    // absent from the deps - re-running this effect would re-render Google's button. But a
    // disable comment naming `react-hooks/exhaustive-deps` is itself the error in this
    // project ("Definition for rule ... was not found"), and `CI=true` promotes it to a
    // failed build. CRA does not register the react-hooks rules here, so the rule cannot
    // fire and there is nothing to suppress. Same trap as `useCountUp.ts`.
  }, [resolvedClientId]);

  return (
    <div className="min-vh-100 bg-light d-flex align-items-center justify-content-center py-5">
      <div className="card border-0 shadow-sm" style={{ maxWidth: 420, width: '100%' }}>
        <div className="card-body p-4 text-center">
          <div
            className="rounded d-grid text-white fw-bold mx-auto mb-3"
            style={{
              width: 40,
              height: 40,
              placeItems: 'center',
              background: 'var(--color-primary)',
            }}
            aria-hidden="true"
          >
            C
          </div>

          <h1 className="h5 mb-2">Client review sign-in</h1>
          <p className="text-muted small mb-4">
            Sign in with the Google account your Colaberry contact invited. You will see only
            the projects you have been added to.
          </p>

          {!resolvedClientId && (
            <div className="alert alert-warning small mb-3" role="alert">
              Sign-in is not configured for this environment.
            </div>
          )}

          <div ref={buttonRef} className="d-flex justify-content-center mb-3" />

          {busy && (
            <div className="small text-muted" role="status">
              Signing you in…
            </div>
          )}

          {error && (
            <div className="alert alert-danger small mb-0 text-start" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ClientSignIn;
