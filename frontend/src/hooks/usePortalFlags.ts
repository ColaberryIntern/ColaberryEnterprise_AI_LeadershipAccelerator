import { useEffect, useState } from 'react';
import { fetchPortalFlags, PortalFlags } from '../services/onboardingApi';

// Fetches the server-authoritative portal flags once. While loading we return
// `null` so callers can hold render until the flag resolves (avoids a flash of
// the redesign then the classic on a rollback). On error we default the Today
// redesign to ON — the flag's job is deliberate rollback, not fail-closed.
const FALLBACK: PortalFlags = { today_redesign: true };

export function usePortalFlags(): { flags: PortalFlags | null; loading: boolean } {
  const [flags, setFlags] = useState<PortalFlags | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPortalFlags()
      .then((f) => { if (alive) setFlags(f); })
      .catch(() => { if (alive) setFlags(FALLBACK); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { flags, loading };
}
