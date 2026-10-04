import React, { useCallback, useEffect, useState } from 'react';
import {
  InternRow, InternDetail, fetchInternDetail,
} from '../../../services/adminInternConsoleApi';
import ManageInternDrawer from './ManageInternDrawer';
import {
  ago, byNeediest, certLabel, heatStep, heatColumnLabels, heatRow, WINDOW_DAYS,
  LEVEL_LABEL, BUCKET_LABEL, dominantTrack, TRACK_ORDER, TRACK_LABEL,
} from './consoleFormat';


/**
 * View C — the Activity Timeline.
 *
 *     "A 28-day heatmap of every intern … so patterns (weekend-only, dropped off after week 1) jump
 *      out. Click anyone to open a full profile with training by section, cert score trend and
 *      project."  (the finalised design's own description)
 *
 * Three departures from the design, each forced by what the data or the permissions actually allow:
 *
 *   1. **No "attended meeting" ring on the heat cells.** That marker is attendance, which is off.
 *   2. **The feed is the real timeline**, not the design's synthesised list. The design built its
 *      feed from a commit count and a meeting total, neither of which has a source; the detail
 *      endpoint already returns the ordered event feed those tables actually hold.
 *   3. **The project block does not call the deep project endpoints.** `/api/admin/projects/:id/gantt`
 *      and its siblings are `requireAdmin`, while this console is `requireSection('internship')` —
 *      calling them here would 403 for exactly the internship-scoped staff the console admits. So the
 *      block shows what the section-gated payload already carries and points at the Projects mode for
 *      the rest, rather than rendering an error for half its audience.
 */

export const ConsoleViewC: React.FC<{
  rows: InternRow[];
  onOpen: (applicationId: string) => void;
  /** Reload the roster after a write, so the panel and the table cannot disagree about a state. */
  onChanged?: () => void;
}> = ({ rows, onOpen, onChanged }) => {
  const ordered = [...rows].sort(byNeediest);
  const [selected, setSelected] = useState<string | null>(ordered[0]?.enrollment_id ?? null);

  // If the filter changes under us the selection can point at someone no longer listed. Fall back to
  // the top of the list rather than rendering a panel for an intern who is not on screen.
  const current = ordered.find((r) => r.enrollment_id === selected) ?? ordered[0] ?? null;

  const labels = heatColumnLabels(current ? heatRow(current) : []);

  return (
    <div className="aint-viewc">
      <div className="aint-card">
        <div className="aint-card-h">
          <h2><i className="ri-calendar-2-line" aria-hidden="true" /> Last 28 days of activity</h2>
          {/* The legend keys the COLOURS, so it lists the tracks rather than intensities. Depth
              within a colour still reads as volume. */}
          <div className="aint-legend aint-heat-legend">
            {TRACK_ORDER.map((track) => (
              <span key={track}>
                <i className={`aint-hc tr-${track} s3`} aria-hidden="true" />
                {TRACK_LABEL[track]}
              </span>
            ))}
          </div>
        </div>
        <div className="aint-card-b aint-heat-wrap">
          <div className="aint-heat" style={{ gridTemplateColumns: `minmax(130px, 1fr) repeat(${WINDOW_DAYS}, 14px)` }}>
            <div className="aint-heat-corner" />
            {labels.map((label, i) => (
              <div className="aint-dh" key={`l-${i}`}>{label}</div>
            ))}
            {ordered.map((row) => (
              <HeatRow
                key={row.enrollment_id}
                row={row}
                selected={row.enrollment_id === current?.enrollment_id}
                onSelect={() => setSelected(row.enrollment_id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="aint-cgrid">
        <div className="aint-card aint-roster">
          <div className="aint-card-h">
            <h2>Interns</h2>
            <span className="aint-sub">quietest first</span>
          </div>
          <div className="aint-roster-b">
            {ordered.map((row) => (
              <button
                type="button"
                key={row.enrollment_id}
                className={`aint-ritem ${row.enrollment_id === current?.enrollment_id ? 'sel' : ''}`}
                aria-pressed={row.enrollment_id === current?.enrollment_id}
                onClick={() => setSelected(row.enrollment_id)}
              >
                <span className={`aint-dot lv-${row.activity.level}`} aria-hidden="true" />
                <span className="aint-ritem-t">
                  <span className="aint-name">{row.name}</span>
                  <span className="aint-sub">
                    {ago(row.activity.days_since)}
                    {row.application_state === 'paused' && ' · paused'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>

        {current
          ? <FocusPanel row={current} onOpen={onOpen} onChanged={onChanged} />
          : <div className="aint-state">Select an intern to see their detail.</div>}
      </div>
    </div>
  );
};

const HeatRow: React.FC<{ row: InternRow; selected: boolean; onSelect: () => void }> = ({ row, selected, onSelect }) => (
  <>
    <button
      type="button"
      className={`aint-rn ${selected ? 'sel' : ''}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className={`aint-dot lv-${row.activity.level}`} aria-hidden="true" />
      {row.name}
    </button>
    {heatRow(row).map((day, i) => {
      // Colour by WHAT they did, shade by how much. A day with nothing has no track and keeps the
      // empty-cell grey rather than taking the first track's colour at zero intensity.
      const track = dominantTrack(day);
      const parts = TRACK_ORDER
        .filter((t) => (day.by_category?.[t] ?? 0) > 0)
        .map((t) => `${TRACK_LABEL[t]} ${day.by_category[t]}`);
      const breakdown = parts.length ? ` — ${parts.join(', ')}` : '';
      return (
      <button
        type="button"
        key={`${row.enrollment_id}-${day.date || i}`}
        className={track ? `aint-hc tr-${track} s${heatStep(day.events)}` : 'aint-hc hs-0'}
        onClick={onSelect}
        // Every cell is a real button with a name, because a grid of unlabelled divs is unusable
        // without a mouse and tells a screen reader nothing at all.
        aria-label={`${row.name}, ${day.date || 'unknown date'}: ${day.events} ${day.events === 1 ? 'event' : 'events'}${breakdown}`}
        title={`${day.date || 'unknown date'}: ${day.events} ${day.events === 1 ? 'event' : 'events'}${breakdown}`}
      />
      );
    })}
  </>
);

/**
 * One intern in depth. Fetches the detail endpoint, which is the same section-gated route the rest of
 * the console uses.
 */
const FocusPanel: React.FC<{
  row: InternRow;
  onOpen: (applicationId: string) => void;
  onChanged?: () => void;
}> = ({ row, onOpen, onChanged }) => {
  const [manageOpen, setManageOpen] = useState(false);
  const [detail, setDetail] = useState<InternDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (enrollmentId: string) => {
    setLoading(true);
    setError(null);
    setDetail(null);
    try {
      setDetail(await fetchInternDetail(enrollmentId));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load this intern.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(row.enrollment_id); }, [load, row.enrollment_id]);

  const cert = certLabel(row);

  return (
    <div className="aint-card aint-focus">
      <div className="aint-card-h">
        <div>
          <div className="aint-name aint-focus-name">{row.name}</div>
          <div className="aint-sub">
            {row.email ?? 'no email'} ·{' '}
            <span className={`aint-pill state-${row.application_state ?? 'unknown'}`}>
              {row.application_state ?? 'no application'}
            </span>
            {row.day !== null && <> · day {row.day}</>} ·{' '}
            <span className={`aint-dot lv-${row.activity.level}`} title={LEVEL_LABEL[row.activity.level]} aria-hidden="true" />
            {' '}{ago(row.activity.days_since)}
          </div>
        </div>
        <div className="aint-actbar">
          {/* One control instead of four half-controls. The drawer is where the write actions live,
              because three of the five cannot be undone and a one-click terminal action on a crowded
              header bar is a misclick waiting to happen. */}
          <button
            type="button"
            className="aint-btn"
            disabled={!row.application_id}
            title={row.application_id ? undefined : 'No application record to manage'}
            onClick={() => setManageOpen(true)}
          >
            Manage
          </button>
          <button
            type="button"
            className="aint-btn"
            disabled={!row.application_id}
            title={row.application_id ? undefined : 'No application record to open'}
            onClick={() => row.application_id && onOpen(row.application_id)}
          >
            Open applicant
          </button>
        </div>
      </div>

      {manageOpen && (
        <ManageInternDrawer
          row={row}
          onClose={() => setManageOpen(false)}
          onChanged={() => { setManageOpen(false); onChanged?.(); }}
        />
      )}

      <div className="aint-card-b aint-focus-b">
        {loading && <div className="aint-state">Loading detail…</div>}
        {error && (
          <div className="aint-state error">
            <p>{error}</p>
            <button type="button" className="aint-btn" onClick={() => load(row.enrollment_id)}>Try again</button>
          </div>
        )}

        {detail && (
          <>
            <section>
              <h3>Training by section</h3>
              {detail.training_sections === null && (
                <div className="aint-sub">
                  No cohort to compare against, so there is no section breakdown for this intern.
                </div>
              )}
              {detail.training_sections?.length === 0 && (
                <div className="aint-sub">No curriculum weeks published yet.</div>
              )}
              {detail.training_sections?.map((wk) => (
                <div className="aint-wkrow" key={String(wk.week)}>
                  <span className="aint-wklabel">
                    {wk.week === null ? 'Unscheduled' : `Week ${wk.week}`}
                  </span>
                  <span className="aint-segs">
                    {wk.sections.map((sec) => (
                      <span
                        key={sec.bucket}
                        className={`aint-seg-cell ${sec.published === 0 ? 'unpub' : ''} ${sec.completedPct >= 100 ? 'full' : ''}`}
                        title={sec.published === 0
                          ? `${BUCKET_LABEL(sec.bucket)}: nothing published`
                          : `${BUCKET_LABEL(sec.bucket)}: ${sec.completed} of ${sec.published} (${sec.completedPct}%)`}
                      >
                        <span style={{ width: `${sec.completedPct}%` }} />
                      </span>
                    ))}
                  </span>
                  <b className="aint-wkpct">{wk.completedPct}%</b>
                </div>
              ))}
            </section>

            <section>
              <h3>Certification</h3>
              <div className="aint-sub">{cert.text}</div>
              <CertTrend
                attempts={detail.cert.series.attempts}
                passing={detail.cert.series.passing_scaled_score}
              />
            </section>

            <section>
              <h3>Project</h3>
              {row.project
                ? (
                  <>
                    <div className="aint-strong">{row.project.name ?? 'Untitled project'}</div>
                    <div className="aint-sub">
                      {row.project.stage} · {row.project.tasks_complete} of {row.project.tasks_total} tasks
                      {row.project.has_repo ? ' · repo connected' : ' · no repo yet'}
                    </div>
                    {row.project.command_center_url && (
                      <a className="aint-btn" href={row.project.command_center_url} target="_blank" rel="noreferrer">
                        Open Command Center
                      </a>
                    )}
                    {/* Deliberately not the gantt / evidence / artifacts endpoints: those are
                        requireAdmin and this console is section-gated, so half the people who can
                        open this panel would get a 403 instead of a project. */}
                    <div className="aint-sub">Releases, stories and evidence live in the Projects tab.</div>
                  </>
                )
                : <div className="aint-sub">No project yet.</div>}
            </section>

            <section>
              <h3>Recent activity</h3>
              {detail.feed.length === 0 && <div className="aint-sub">Nothing recorded yet.</div>}
              <ul className="aint-feed">
                {detail.feed.map((e, i) => (
                  <li key={`${e.occurredAt}-${e.source}-${i}`}>
                    <span className="aint-feed-t">{e.summary ?? e.type}</span>
                    <span className="aint-sub">
                      {e.source} · {e.occurredAt.slice(0, 10)}
                      {e.occurrences > 1 && ` · ×${e.occurrences}`}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

/**
 * The practice-score trend.
 *
 * The pass line comes from the payload's own `passing_scaled_score`, never a literal. Each point's
 * tooltip carries the item count it was scored on, because 1000 from a one-item set and 895 from a
 * sixty-item mock are both real and not comparable — the chart draws them in order, and the reader
 * is told which is which rather than being left to assume.
 */
const CertTrend: React.FC<{
  attempts: InternDetail['cert']['series']['attempts'];
  passing: number;
}> = ({ attempts, passing }) => {
  if (attempts.length === 0) return <div className="aint-sub">No diagnostic or practice sittings yet.</div>;

  const w = 260;
  const h = 90;
  const pad = 10;
  const lo = 400;
  const hi = 1000;
  const y = (s: number) => h - pad - ((Math.max(lo, Math.min(hi, s)) - lo) / (hi - lo)) * (h - 2 * pad);
  const x = (i: number) => pad + (attempts.length > 1 ? i / (attempts.length - 1) : 0.5) * (w - 2 * pad);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      role="img"
      aria-label={`Practice scores, oldest first: ${attempts.map((a) => `${a.scaled_score} on ${a.items ?? 'unknown'} items`).join(', ')}. Pass line ${passing}.`}
    >
      <line x1="0" x2={w} y1={y(passing)} y2={y(passing)} stroke="var(--color-primary)" strokeDasharray="4 3" />
      <text x={w - 2} y={y(passing) - 4} textAnchor="end" fontSize="10" fill="var(--color-primary)">pass {passing}</text>
      <polyline
        fill="none"
        stroke="var(--color-info)"
        strokeWidth="2"
        points={attempts.map((a, i) => `${x(i)},${y(a.scaled_score)}`).join(' ')}
      />
      {attempts.map((a, i) => (
        <circle key={`${a.completed_at}-${i}`} cx={x(i)} cy={y(a.scaled_score)} r="3.5" fill="var(--color-info)">
          <title>
            {a.completed_at.slice(0, 10)}: {a.scaled_score}
            {a.items !== null ? ` · ${a.correct ?? '?'} of ${a.items} items` : ' · item count not recorded'}
            {` · ${a.mode}`}
          </title>
        </circle>
      ))}
    </svg>
  );
};

export default ConsoleViewC;
