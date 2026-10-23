import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import portalApi from '../../utils/portalApi';

/**
 * The landing page behind a session's persistent live link (L7.2).
 *
 * WHY IT EXISTS AT ALL. The workspace and companion URLs are generated so a show can be
 * promoted before it airs — which means they will be clicked, printed and scanned long before
 * there is anything to watch. A link that 404s until the moment it works is worse than no link:
 * whoever clicks it early concludes it is broken and does not come back.
 *
 * SO NOT-YET-STARTED IS A FIRST-CLASS STATE, not an error. The server decides the moment; this
 * page only renders it. That split is the point of the ticket — one persistent URL whose
 * meaning changes, rather than a new URL per moment that invalidates everything already shared.
 *
 * The companion EXPERIENCE is L4.7. This renders the same honest states on a phone so the
 * generated companion URL is not a lie in the meantime.
 */

type Moment = 'not_started' | 'live' | 'ended' | 'unknown';

interface MomentResponse {
  moment: Moment;
  watch_url: string | null;
}

/** Poll while waiting. Slow on purpose: this is a waiting room, not a dashboard. */
const POLL_MS = 30_000;

const COPY: Record<Moment, { title: string; body: string }> = {
  not_started: {
    title: 'This class has not started yet',
    body: 'Leave this page open. It will update on its own when the class goes live.',
  },
  live: {
    title: 'This class is live now',
    body: 'Open the class to watch.',
  },
  ended: {
    title: 'This class has ended',
    body: 'A replay will appear here if one is published.',
  },
  unknown: {
    // Deliberately not "something went wrong": the link is fine, we just cannot answer yet.
    title: 'We cannot check this class right now',
    body: 'This is usually temporary. Try again in a moment.',
  },
};

export default function LiveSessionPage(): React.ReactElement {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [moment, setMoment] = useState<Moment | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return undefined;
    let live = true;

    const read = async () => {
      try {
        const res = await portalApi.get(`/api/portal/sessions/${sessionId}/live-moment`);
        if (!live) return;
        const data = res.data as MomentResponse;
        setMoment(data.moment);
        setWatchUrl(data.watch_url);
      } catch {
        // A failed check is not a broken link, and saying so would train people to distrust it.
        if (live) { setMoment('unknown'); setWatchUrl(null); }
      }
    };

    read();
    const timer = setInterval(read, POLL_MS);
    return () => { live = false; clearInterval(timer); };
  }, [sessionId]);

  const copy = moment ? COPY[moment] : null;

  return (
    <main className="container py-5" data-testid="live-session-page">
      <div className="mx-auto" style={{ maxWidth: 560 }}>
        <h1 className="h4 mb-3" data-testid="live-session-title">
          {copy ? copy.title : 'Checking this class…'}
        </h1>
        <p className="text-muted" data-testid="live-session-body">
          {copy ? copy.body : 'One moment.'}
        </p>
        {moment === 'live' && watchUrl && (
          <a className="btn btn-primary" href={watchUrl} data-testid="live-session-watch">
            Watch now
          </a>
        )}
      </div>
    </main>
  );
}
