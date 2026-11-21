import React, { useEffect, useState } from 'react';
import { getRegistrantReach, type RegistrantReach } from '../../../../services/commsHubApi';

/**
 * Under "Registrants of <event> (in-app)" in Compose (CH9.6): how many of the event's registrants the
 * in-app notification will actually reach, before anyone approves it. Counts only, never people.
 * Registrants without a platform account are not reached in-app; the note says so plainly.
 */
export function reachSentence(r: RegistrantReach): string {
  if (r.registrants === 0) return 'Nobody has registered yet, so this reaches no one for now. Anyone who registers before it sends is included.';
  const base = `${r.reachable} of ${r.registrants} ${r.registrants === 1 ? 'registrant has' : 'registrants have'} a platform account and will get it in the app.`;
  const rest = r.reachable < r.registrants ? ' The others are not reached in-app.' : '';
  const partial = r.eventbrite !== 'ok' ? ' Eventbrite could not be read just now, so this counts only people who registered on our site; the send waits for Eventbrite.' : '';
  return base + rest + partial;
}

export default function RegistrantReachNote({ hubEventId }: { hubEventId: string }): React.ReactElement {
  const [reach, setReach] = useState<RegistrantReach | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    getRegistrantReach(hubEventId).then((r) => { if (live) setReach(r); }, () => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [hubEventId]);
  return (
    <div className="form-text ms-4" role="status" data-testid="ch-registrant-reach">
      {failed ? 'The registrant count did not load.' : reach ? reachSentence(reach) : 'Counting registrants...'}
    </div>
  );
}
