import React, { useState, useEffect, useRef, useCallback } from 'react';

const POLL_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_NETWORK_FAILURES = 5;

/**
 * Why this component stops polling instead of retrying forever:
 *
 * Until 2026-09-01 this banner polled /api/admin/system/safe-mode on a timer that
 * never stopped, sent `Bearer null` when there was no token, ignored any non-OK
 * response, and swallowed every error. An admin tab left open past its token
 * expiry therefore re-sent an expired JWT once a minute indefinitely (browsers
 * throttle background timers to ~60s, which is why the observed cadence was 60s
 * rather than the declared 30s).
 *
 * Each of those requests wrote an `admin_auth_failed` row to `ai_events`. Two
 * abandoned tabs produced 1,393 rows in 24 hours and drove the reliability alerter
 * to page at "94% AI event failure rate" while real model calls were failing at 0%.
 *
 * A poll that cannot succeed must stop, not retry. An expired or missing token is
 * terminal for this component: only a fresh login fixes it, and the shared axios
 * client (utils/api.ts) already owns the redirect when the user makes a real
 * request. So we clear the stale token and stand down quietly.
 */
export default function SafeModeBanner() {
  const [active, setActive] = useState(false);
  const [disabling, setDisabling] = useState(false);
  // Set once the poll can never succeed again (auth is terminal, or the network
  // has failed repeatedly). Read by the interval to stop itself.
  const stoppedRef = useRef(false);
  const consecutiveNetworkFailuresRef = useRef(0);

  const fetchStatus = useCallback(async (): Promise<'ok' | 'stop'> => {
    if (stoppedRef.current) return 'stop';

    const token = localStorage.getItem('admin_token');
    // No token means a guaranteed 401. Do not spend a request to discover that.
    if (!token) {
      stoppedRef.current = true;
      return 'stop';
    }

    let res: Response;
    try {
      res = await fetch('/api/admin/system/safe-mode', {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      // Genuinely transient (offline, DNS, connection reset). Retry, but bounded:
      // a tab that has been offline for hours should not poll until it is closed.
      consecutiveNetworkFailuresRef.current += 1;
      if (consecutiveNetworkFailuresRef.current >= MAX_CONSECUTIVE_NETWORK_FAILURES) {
        stoppedRef.current = true;
        console.warn('[SafeModeBanner] Polling stopped after repeated network failures', {
          error_class: err instanceof Error ? err.constructor.name : 'Error',
          consecutive_failures: consecutiveNetworkFailuresRef.current,
        });
        return 'stop';
      }
      return 'ok';
    }

    consecutiveNetworkFailuresRef.current = 0;

    // 401/403 are terminal: the token is expired, malformed, or lacks the role.
    // Retrying cannot change any of those, and every retry is a logged auth failure.
    if (res.status === 401 || res.status === 403) {
      stoppedRef.current = true;
      localStorage.removeItem('admin_token');
      console.warn('[SafeModeBanner] Polling stopped: admin session is no longer valid', {
        error_class: 'AuthError',
        status: res.status,
      });
      return 'stop';
    }

    if (res.ok) {
      try {
        const data = await res.json();
        setActive(data.safe_mode_active === true);
      } catch (err) {
        // Malformed body. Keep the last known state, but say so rather than
        // failing silently.
        console.warn('[SafeModeBanner] Could not parse safe-mode response', {
          error_class: err instanceof Error ? err.constructor.name : 'Error',
        });
      }
    }

    return 'ok';
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;

    const tick = async () => {
      const outcome = await fetchStatus();
      if (outcome === 'stop' && interval !== undefined) {
        clearInterval(interval);
        interval = undefined;
      }
    };

    void tick();
    interval = setInterval(() => { void tick(); }, POLL_INTERVAL_MS);

    return () => {
      if (interval !== undefined) clearInterval(interval);
    };
  }, [fetchStatus]);

  const handleDisable = async () => {
    setDisabling(true);
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/system/safe-mode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: false }),
      });
      if (res.ok) {
        setActive(false);
      }
    } catch {
      // Will retry on next poll
    } finally {
      setDisabling(false);
    }
  };

  if (!active) return null;

  return (
    <div
      className="alert alert-warning mb-0 rounded-0 d-flex align-items-center justify-content-between py-2 px-4"
      role="alert"
      style={{ borderLeft: '4px solid var(--color-secondary)' }}
    >
      <div className="d-flex align-items-center gap-2">
        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className="text-warning">
          <path d="M8.982 1.566a1.13 1.13 0 0 0-1.96 0L.165 13.233c-.457.778.091 1.767.98 1.767h13.713c.889 0 1.438-.99.98-1.767L8.982 1.566zM8 5c.535 0 .954.462.9.995l-.35 3.507a.552.552 0 0 1-1.1 0L7.1 5.995A.905.905 0 0 1 8 5zm.002 6a1 1 0 1 1 0 2 1 1 0 0 1 0-2z" />
        </svg>
        <strong className="small">Safe Mode Active</strong>
        <span className="small text-muted">— LLM calls are disabled. Only cached content is being served.</span>
      </div>
      <button
        className="btn btn-sm btn-outline-danger"
        onClick={handleDisable}
        disabled={disabling}
      >
        {disabling ? 'Disabling…' : 'Disable Safe Mode'}
      </button>
    </div>
  );
}
