import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listStudioSessions, type StudioSessionRow } from '../../../services/studioSetupApi';
import './studioSetup.css';
import StudioRail from './StudioRail';

/**
 * The Studio setup index (D4, P4-01) — pick the class to configure.
 *
 * ## Why this page exists at all
 *
 * An admin nav entry is a fixed string. It cannot carry a session id. So "reach Studio setup from
 * the admin menu" needs somewhere to land that is not already about one class, and this is it.
 * The plan audit caught that: without this page the first success criterion was unwitnessable,
 * because there was no route the menu could point at.
 *
 * Like the detail screen, this renders OUTSIDE AdminLayout and opens in its own browser tab, so
 * it holds no in-app state and reads everything it shows from one call.
 */

/** A class with no broadcast is the common case here, and it reads as a plain dash, not a gap. */
function BroadcastState({ row }: { row: StudioSessionRow }): React.ReactElement {
  if (!row.editorial_state) {
    return <span className="cls-row-when">Not set up</span>;
  }
  return (
    <span className="cls-row-when">
      {row.editorial_state}
      {row.access_mode ? ` · ${row.access_mode}` : ''}
    </span>
  );
}

export default function StudioIndexPage(): React.ReactElement {
  const [rows, setRows] = useState<StudioSessionRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listStudioSessions();
        if (!cancelled) setRows(list);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="cls-root">
      <StudioRail />
      <div className="cls-shell">
        <header className="cls-head">
          <h1 className="cls-title">Studio setup</h1>
          <p className="cls-sub">
            Pick the class to set up. This list covers the last month and the next four months,
            because a class further out than that is not usually what you came here for.
          </p>
        </header>

        <section className="cls-card">
          {failed && (
            <p className="cls-note cls-note-error" role="alert">
              The class list could not be loaded. Reload the page to try again.
            </p>
          )}

          {!failed && rows === null && <p className="cls-empty">Loading classes.</p>}

          {!failed && rows !== null && rows.length === 0 && (
            <p className="cls-empty">
              There are no classes scheduled in this window. Create a session first, then come
              back to set up its broadcast.
            </p>
          )}

          {rows?.map((row) => (
            <div className="cls-row" key={row.id}>
              <div className="cls-row-main">
                <strong>{row.title}</strong>
                <span className="cls-row-when">
                  {row.session_date ?? 'No date'}
                  {row.start_time ? ` at ${row.start_time}` : ''}
                  {row.cohort_name ? ` · ${row.cohort_name}` : ''}
                </span>
              </div>
              <BroadcastState row={row} />
              <Link className="cls-btn cls-btn-ghost" to={`/admin/live/studio/${row.id}`}>
                Set up
              </Link>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
