import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState, SectionCard } from '../../../../components/admin/shell';
import { getToday, type TodayPayload } from '../../../../services/admissionsOpsApi';
import { AGENT_NAME } from '../agentConfig';
import { screenHref } from '../screens';
import { useAgentSurface } from '../agent/agentSurface';
import TodayQueue from './TodayQueue';
import { SidePanels, TargetCard } from './TodaySide';
import { filterQueue, systemNames, type Lens } from './todayFormat';

/**
 * Today (AO2.1, kit SPEC 4.1): the morning briefing, the enrollment target, seven filters over one queue, what the
 * agent may do and the connected systems. Reads GET /api/admin/admissions-ops/today. While the payload is the sample,
 * a label says so at the top of the screen.
 */
export default function TodayScreen(): React.ReactElement {
  const [data, setData] = useState<TodayPayload | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    getToday().then(setData).catch(() => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  // Published while Today is on screen, loading or not; the sources come from the payload once it arrives.
  useAgentSurface('today', () => ({
    sources: (data?.systems ?? []).map((s) => ({ name: s.name, syncedAt: s.synced_at, status: s.status })),
  }));

  if (failed) {
    return (
      <div className="alert alert-warning d-flex align-items-center justify-content-between" role="alert" data-testid="today-error">
        <span>Today did not load. Nothing on this screen is current until it does.</span>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={load}>Try again</button>
      </div>
    );
  }
  if (!data) return <p className="ops-muted" role="status" data-testid="today-loading">Loading Today.</p>;
  return <TodayView data={data} now={new Date()} />;
}

/** The screen itself, from a payload. Pure: no data call, so it can also be rendered statically. */
export function TodayView({ data, now }: { data: TodayPayload; now: Date }): React.ReactElement {
  const [lens, setLens] = useState<Lens>('all');
  const items = filterQueue(data.queue, lens);
  // A count that includes items resting on a down system says so, so it is not read as current.
  const downIn = (lensId: Lens) => filterQueue(data.queue, lensId).filter((q) => q.down_systems.length > 0).length;
  const lenses: Array<{ id: Lens; label: string; count: number; systems: string; down: number }> = [
    { id: 'all', label: 'Everything', count: data.queue.length, systems: `All ${data.systems.length} systems`, down: downIn('all') },
    ...data.sections.map((s) => ({ id: s.id as Lens, label: s.label, count: s.count, systems: systemNames(s.systems, data.systems), down: downIn(s.id) })),
  ];
  return (
    <div className="ops-today" data-testid="ops-today">
      {data.sample && (
        <p className="ops-sample" role="note" data-testid="today-sample">Sample data. Every name and number on this screen is invented. Nothing here is live.</p>
      )}
      <div className="ops-today-top">
        <section className="ops-briefing" aria-label={`Morning briefing from ${AGENT_NAME}`} data-testid="today-briefing">
          <p className="ops-briefing-kicker">Morning briefing from {AGENT_NAME}</p>
          <p className="ops-briefing-headline">{data.briefing.headline}{data.briefing.start_with ? ` Start with: ${data.briefing.start_with}.` : ''}</p>
          <p className="mb-0">{data.briefing.detail}</p>
          <div className="ops-briefing-actions">
            <Link className="btn btn-light" to={screenHref('approvals')}>Review approvals</Link>
            <Link className="btn btn-outline-light" to={screenHref('agent')}>Ask {AGENT_NAME}</Link>
          </div>
        </section>
        <TargetCard data={data} now={now} />
      </div>
      <div className="ops-lenses" role="group" aria-label="Filter the queue by section">
        {lenses.map((l) => (
          <button key={l.id} type="button" className={`ops-lens${lens === l.id ? ' active' : ''}`} aria-pressed={lens === l.id}
            onClick={() => setLens(l.id)} data-testid={`today-lens-${l.id}`}>
            <span className="ops-lens-label">{l.label}</span><span className="ops-lens-count">{l.count}</span>
            <span className="ops-lens-systems">{l.systems}</span>
            {l.down > 0 && <span className="ops-lens-down" data-testid={`today-lens-down-${l.id}`}>{l.down} from a down system</span>}
          </button>
        ))}
      </div>
      <div className="ops-today-body">
        <SectionCard title={`Needs attention: ${lenses.find((l) => l.id === lens)?.label.toLowerCase()}`} icon="alarm-warning-line">
          {data.queue.length === 0
            ? <EmptyState icon="checkbox-circle-line" title="Nothing needs attention" description="Every check came back clean." tone="quiet" />
            : <TodayQueue items={items} systems={data.systems} now={now} />}
        </SectionCard>
        <div className="ops-today-side"><SidePanels data={data} now={now} /></div>
      </div>
    </div>
  );
}
