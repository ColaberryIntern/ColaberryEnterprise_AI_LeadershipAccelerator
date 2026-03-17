import React, { useState, useEffect, useCallback } from 'react';

const POLL_INTERVAL_MS = 30_000;

export default function SafeModeBanner() {
  const [active, setActive] = useState(false);
  const [disabling, setDisabling] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('adminToken');
      const res = await fetch('/api/admin/system/safe-mode', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActive(data.safe_mode_active === true);
      }
    } catch {
      // Silently ignore — banner stays in last known state
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const handleDisable = async () => {
    setDisabling(true);
    try {
      const token = localStorage.getItem('adminToken');
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
