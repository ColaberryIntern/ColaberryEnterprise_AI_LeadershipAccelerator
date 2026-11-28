import React from 'react';
import { SectionCard } from '../../../../components/admin/shell';
import type { TodayPayload } from '../../../../services/admissionsOpsApi';
import { AGENT_NAME } from '../agentConfig';
import { STATUS_LABEL, centralTime, systemNames } from './todayFormat';

const whole = (n: number) => n.toLocaleString('en-US');

/** The enrollment target card: confirmed paid against target, the daily requirement, prospects at the assumed rate. */
export function TargetCard({ data, now }: { data: TodayPayload; now: Date }): React.ReactElement {
  const t = data.target;
  const pct = Math.min(100, Math.round((t.confirmed_paid / t.target) * 100));
  // A figure is never shown as current when its source is down or stale.
  const status = data.systems.find((s) => s.id === t.source)?.status ?? 'not_connected';
  const notCurrent = status !== 'ok';
  return (
    <SectionCard title="Enrollment target" icon="flag-line">
      <div data-testid="today-target" data-current={notCurrent ? 'no' : 'yes'} className={notCurrent ? 'ops-not-current' : undefined}>
        {notCurrent && (
          <p className="ops-down mb-2" role="note" data-testid="today-target-not-current">
            {systemNames([t.source], data.systems)} is {status === 'not_connected' ? 'not connected' : status}. These figures are from the last pull and are not current.
          </p>
        )}
        <p className="ops-big mb-1"><strong>{whole(t.confirmed_paid)}</strong> confirmed paid of {whole(t.target)}</p>
        <div className="ops-bar" role="img" aria-label={`${t.confirmed_paid} of ${t.target} confirmed paid`}><div style={{ width: `${pct}%` }} /></div>
        <dl className="ops-target-grid">
          <div><dt>{whole(t.daily_required)} a day</dt><dd>needed to close {whole(t.remaining)} remaining in {whole(t.days_left)} days</dd></div>
          <div><dt>{whole(t.prospects_needed)}</dt><dd>qualified prospects at an assumed {Math.round(t.assumed_rate * 1000) / 10}%</dd></div>
        </dl>
        <p className="ops-source mb-0">
          Counts paid enrollments only, from {systemNames([t.source], data.systems)}, pulled {centralTime(t.pulled_at, now)}. A planning scenario, not a forecast.
        </p>
      </div>
    </SectionCard>
  );
}

/** What the agent may do (the five levels) and the connected systems with their freshness. */
export function SidePanels({ data, now }: { data: TodayPayload; now: Date }): React.ReactElement {
  return (
    <>
      <SectionCard title={`What ${AGENT_NAME} may do`} icon="shield-check-line">
        <ol className="ops-levels" data-testid="today-may-do">
          {data.may_do.map((m) => <li key={m.level}><strong>{m.name}.</strong> {m.rule}</li>)}
        </ol>
      </SectionCard>
      <SectionCard title="Connected systems" icon="plug-line">
        <ul className="ops-systems" data-testid="today-systems">
          {data.systems.map((s) => (
            <li key={s.id} data-testid={`today-system-${s.id}`} data-status={s.status}>
              <span className={`ops-dot ops-dot-${s.status}`} aria-hidden="true" />
              <span className="ops-system-name">{s.name}</span>
              <span className="ops-muted">{STATUS_LABEL[s.status]}{s.status === 'not_connected' ? '' : `, last pull ${centralTime(s.synced_at, now)}`}</span>
            </li>
          ))}
        </ul>
      </SectionCard>
    </>
  );
}
