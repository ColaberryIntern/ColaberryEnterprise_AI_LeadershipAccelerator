import React, { useState, useEffect, useCallback, useRef } from 'react';

const POLL_INTERVAL_MS = 30_000;

/**
 * The "Safe Mode Active" strip across the top of the admin.
 *
 * ── WHY THIS STOPS POLLING ON A 403 ─────────────────────────────────────────
 *
 * 2026-11-11. Sohail filed three bug reports from the Marketing composer. Each one
 * carried `failed_requests: 15` — the recorder's cap — and every entry was the same
 * line: `GET /api/admin/system/safe-mode -> 403`. nginx counted **46** of them in a
 * single 23-minute session.
 *
 * This component is mounted in `AdminLayout`, so it runs on every admin page, and
 * `/api/admin/system/safe-mode` is section-gated. A section-scoped admin — which is
 * what Sohail is, and what every future marketing hire will be — is refused every
 * thirty seconds for as long as the tab is open. Nothing surfaced, because the error
 * was swallowed below; the only visible effect was that the evidence in his bug
 * reports was almost entirely this.
 *
 * A 403 is an ANSWER, not a blip. It says "this account may not read this", and the
 * forty-sixth ask gets the same answer as the first. So the poll stops on 401/403 and
 * keeps retrying on anything else, because a network error genuinely can be transient.
 *
 * WHAT THIS DOES NOT DO: widen who may read the endpoint. The same path also accepts a
 * POST that toggles safe mode, so loosening its gate is a security decision rather than
 * a frontend one. The scoped admin simply never sees this banner — which was already
 * true, just expensively.
 */
export default function SafeModeBanner() {
  const [active, setActive] = useState(false);
  const [disabling, setDisabling] = useState(false);

  /**
   * A ref rather than state, deliberately. The interval closes over this, and a state
   * update would re-run the effect and start a fresh interval — which is the loop this
   * is trying to end.
   */
  const refused = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (refused.current) return;
    try {
      const token = localStorage.getItem('admin_token');
      const res = await fetch('/api/admin/system/safe-mode', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401 || res.status === 403) {
        // Not an error to retry. This account is not permitted to read it, and that
        // will not change while the page is open.
        refused.current = true;
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setActive(data.safe_mode_active === true);
      }
    } catch {
      // A network failure IS transient — keep polling. Silently, as before: a banner
      // that cannot reach its endpoint has nothing useful to say to the operator.
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
    const interval = setInterval(() => {
      if (refused.current) {
        // Stop the timer too, not just the body of it. Leaving it running would keep
        // waking the tab every thirty seconds to do nothing.
        clearInterval(interval);
        return;
      }
      void fetchStatus();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
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
