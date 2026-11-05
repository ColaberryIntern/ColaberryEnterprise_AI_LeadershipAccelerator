import { useEffect, useState } from 'react';

// STORY-016: surfaces subscribed summaries whose provenance has gone stale
// (STORY-015's provenance_stale flag). Polls once on mount and whenever
// refreshKey changes (bumped by SummaryList after a subscribe/unsubscribe) --
// no push mechanism (WebSocket) wired up for this, kept simple for the demo.
export default function UpdatesBanner({ sessionId, refreshKey }) {
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/subscriptions/${sessionId}/updates`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setUpdates(data);
      } catch {
        // Best-effort UI surface -- a failed poll just means no banner shows.
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, refreshKey]);

  if (updates.length === 0) return null;

  return (
    <div className="updates-banner" role="status">
      <strong>{updates.length} update{updates.length === 1 ? '' : 's'}:</strong>{' '}
      {updates.map((u) => u.name).join(', ')} — source information has changed since publication.
    </div>
  );
}
