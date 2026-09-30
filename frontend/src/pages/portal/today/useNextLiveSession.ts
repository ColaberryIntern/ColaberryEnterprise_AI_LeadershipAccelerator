import { useEffect, useState } from 'react';
import { getNextSession, NextLiveSession } from '../../../services/onboardingApi';

// Fetches the student's next live class session once on mount. Fail-safe: any
// error resolves to a null session so the Today shell never sees a throw. An
// Explorer/guest with no scheduled session also resolves to null, and the shell
// falls back to its existing first-class countdown card.
export function useNextLiveSession(): { session: NextLiveSession | null; loading: boolean } {
  const [session, setSession] = useState<NextLiveSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    getNextSession()
      .then((s) => { if (alive) setSession(s); })
      .catch(() => { if (alive) setSession(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  return { session, loading };
}
