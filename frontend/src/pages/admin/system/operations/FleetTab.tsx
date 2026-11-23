/**
 * Fleet — what is running, and is it alive?
 *
 * Four panels, matching the design template exactly. The page renders; it does not decide.
 * Every status word, tone and ordering arrives from the backend already settled, so there is
 * no second copy of "is this job dead" living in a component.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Card, Empty, Pill, PlannedButton, RowMain } from './OperationsChrome';
import { FleetPanels, getFleetPanels } from '../../../../services/platformOperationsApi';

/** "2 min ago", "3 days ago" — the template's relative phrasing for a fire time. */
function ago(iso: string | null, now: number): string {
  if (!iso) return 'never';
  const ms = now - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 48) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function duration(ms: number | null): string {
  if (ms === null) return 'no record';
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${Math.round(ms / 100) / 10} s`;
  return `${Math.round(ms / 6000) / 10} min`;
}

export default function FleetTab() {
  const [panels, setPanels] = useState<FleetPanels | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    getFleetPanels()
      .then((p) => { setPanels(p); setFailure(null); })
      .catch((e) => {
        // A health page that renders empty panels on a failed read is claiming the fleet is
        // empty. Say what happened instead.
        const msg = e?.response?.data?.error || e?.message || 'The request did not complete.';
        setFailure(String(msg));
        setPanels(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  if (loading && !panels) {
    return <Empty>Reading the fleet…</Empty>;
  }

  if (failure) {
    return (
      <div className="ops-failed">
        <h2>This page cannot tell you whether the fleet is alive</h2>
        <p className="ops-note">{failure}</p>
        <div className="ops-actions">
          <button type="button" className="ops-btn ops-btn--primary" onClick={load}>Try again</button>
        </div>
      </div>
    );
  }

  if (!panels) return <Empty>No reading.</Empty>;

  const now = Date.parse(panels.generated_at);
  const c = panels.coverage;

  return (
    <>
      {/*
        The coverage line is the basis for the entire tab, not decoration. A reader who does
        not know that 48 of 122 timers report under no name reads "everything fired" very
        differently from one who does.
      */}
      <p className="ops-note">
        {c.registry_cron_agents} scheduled agents in the registry, {c.reporting} of them reporting
        and {c.never_reported} silent about themselves for {c.lookback_days} days.{' '}
        {c.timer_sites} timers in the source, {c.untracked_sites} of them watched by nothing.
      </p>

      <div className="ops-grid">
        <Card
          title="Live fleet"
          basis={`registry vs last ${panels.window_hours} hours`}
          note="A row that claims to run and has not is red. A row nothing has ever reported on is amber: that is us not watching, which is not the same as dead."
          actions={<>
            <button type="button" className="ops-btn ops-btn--primary" onClick={load}>Run check now</button>
            <PlannedButton label="Export evidence" phase="evidence export lands with the Release and data tab" />
          </>}
        >
          {panels.live.length === 0
            ? <Empty>The registry claims no enabled cron agents at all.</Empty>
            : panels.live.map((r) => (
              <div className="ops-row" key={r.agent_name}>
                <RowMain
                  title={r.agent_name}
                  sub={(
                    <span title={r.schedule}>
                      registry: {r.schedule_label}
                      {r.schedule_source === 'override' ? ' (override)' : ''}
                    </span>
                  )}
                />
                <Pill tone={r.tone} label={r.status} />
              </div>
            ))}
        </Card>

        <Card
          title="Untracked timers"
          basis="firing under no registry row"
          note="Each one offers the row it would need, for a person to accept or reject."
          actions={<>
            <PlannedButton label="Propose row" phase="writing a registry row is the Controls tab" primary />
            <PlannedButton label="Dismiss" phase="writing a registry row is the Controls tab" />
          </>}
        >
          {panels.untracked.length === 0
            ? <Empty>Every timer in the source reports under a name the registry holds.</Empty>
            : panels.untracked.map((r) => (
              <div className="ops-row ops-row--stacked" key={r.location}>
                <div className="ops-row" style={{ border: 0, padding: 0 }}>
                  <RowMain
                    title={r.reports_as ? r.reports_as : '[untracked timer]'}
                    sub={<>{r.location} · fires {r.schedule ?? 'on a computed schedule'}</>}
                  />
                  <Pill tone={r.tone} label={r.status} />
                </div>
                <div className="ops-proposal">
                  Proposed row: {r.proposed_row.agent_name} · {r.proposed_row.trigger_type} ·
                  {' '}{r.proposed_row.schedule ?? 'schedule unknown'} · enabled off
                </div>
              </div>
            ))}
        </Card>

        <Card
          title="Last run, per job"
          basis="what the logs would have told you"
          width="table"
          actions={<PlannedButton label="Open trace" phase="trace drill-down is the Failures tab" primary />}
        >
          {panels.runs.length === 0
            ? <Empty>Nothing has reported a run.</Empty>
            : (
              <div className="ops-table-wrap">
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Name</th><th>Schedule</th><th>Last fire</th>
                      <th>Duration</th><th>Outcome</th><th>Error class</th>
                    </tr>
                  </thead>
                  <tbody>
                    {panels.runs.map((r) => (
                      <tr key={r.agent_name}>
                        <td className="ops-name">{r.agent_name}</td>
                        <td className="ops-mono ops-nowrap" title={r.schedule}>{r.schedule_label}</td>
                        <td>{ago(r.last_fire_at, now)}</td>
                        <td className="ops-mono">{duration(r.duration_ms)}</td>
                        <td className={
                          r.outcome === 'OK' ? 'ops-outcome-ok'
                            : r.outcome === 'Failed' ? 'ops-outcome-bad' : 'ops-outcome-off'
                        }
                        >
                          {r.outcome}
                        </td>
                        <td className="ops-mono">{r.error_class}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </Card>

        <Card
          title="Silent since"
          basis="the outage mode nobody currently sees"
          note="Jobs whose last SUCCESSFUL run is older than their own schedule allows. A job that keeps running and keeps failing is on time by last-run, and is exactly what this finds."
          actions={<PlannedButton label="Raise with a person" phase="raising lands with the Direction tab" primary />}
        >
          {panels.silent.length === 0
            ? <Empty>Every job we can read a schedule for has succeeded within its own cadence.</Empty>
            : panels.silent.map((r) => (
              <div className="ops-row" key={r.agent_name}>
                <RowMain
                  title={r.agent_name}
                  sub={(
                    <span title={r.schedule}>
                      schedule allows {r.schedule_label} · last success {ago(r.last_success_at, now)}
                    </span>
                  )}
                />
                <Pill tone={r.tone} label={r.status} />
              </div>
            ))}
        </Card>
      </div>
    </>
  );
}
