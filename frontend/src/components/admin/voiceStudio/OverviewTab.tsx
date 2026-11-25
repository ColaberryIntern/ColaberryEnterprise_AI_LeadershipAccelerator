import React, { useCallback, useEffect, useState } from 'react';
import { EmptyState, SectionCard, StatusBadge } from '../shell';
import { getOverview, statusOf, studioErrorMessage, type Kpi, type Overview, type OverviewMode } from '../../../services/voiceStudioApi';
import { ENGINE_LABEL, PROVENANCE_HELP, PROVENANCE_LABEL, denominatorText, formatKpiValue } from './voiceStudioFormat';

/**
 * Overview (VS3.3). Every KPI states its window, its provenance and its denominator; a KPI with no
 * data reads "No data", never 0. Test-mode traffic is a separate view, never mixed into live.
 */
const WINDOWS = [7, 30, 90] as const;

export function KpiTile({ kpi }: { kpi: Kpi }): React.ReactElement {
  const den = denominatorText(kpi);
  return (
    <div className="card border-0 shadow-sm h-100" data-testid={`kpi-${kpi.key}`}>
      <div className="card-body">
        <div className="small text-muted">{kpi.label}</div>
        <div className={`fs-4 fw-semibold ${kpi.value === null ? 'text-muted' : ''}`} data-testid={`kpi-${kpi.key}-value`}>{formatKpiValue(kpi)}</div>
        {den && <div className="small text-muted" data-testid={`kpi-${kpi.key}-denominator`}>{den}</div>}
        <span className="badge text-bg-light border mt-2" title={PROVENANCE_HELP[kpi.provenance]} data-testid={`kpi-${kpi.key}-provenance`}>
          {PROVENANCE_LABEL[kpi.provenance]}
        </span>
      </div>
    </div>
  );
}

export default function OverviewTab(): React.ReactElement {
  const [days, setDays] = useState<number>(7);
  const [mode, setMode] = useState<OverviewMode>('live');
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [off, setOff] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getOverview(days, mode)
      .then((o) => { setData(o); setOff(false); })
      .catch((e) => { if (statusOf(e) === 404) setOff(true); else setError(studioErrorMessage(e, 'The overview could not be loaded. Try again.')); })
      .finally(() => setLoading(false));
  }, [days, mode]);

  useEffect(() => { load(); }, [load]);

  if (off) return <EmptyState icon="toggle-line" title="Voice Studio is switched off on this server" description="An administrator turns it on with VOICE_STUDIO_UI_ENABLED. Calls are not affected either way." />;

  return (
    <>
      <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
        <div className="btn-group btn-group-sm" role="group" aria-label="Time window">
          {WINDOWS.map((d) => (
            <button key={d} type="button" className={`btn ${days === d ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={days === d} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
        <div className="btn-group btn-group-sm" role="group" aria-label="Traffic">
          {(['live', 'test'] as const).map((m) => (
            <button key={m} type="button" className={`btn ${mode === m ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === 'live' ? 'Live calls' : 'Test calls'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error} <button type="button" className="btn btn-sm btn-link" onClick={load}>Retry</button></div>}
      {loading && !data && <div className="text-center py-5"><div className="spinner-border text-primary" role="status"><span className="visually-hidden">Loading</span></div></div>}

      {data && (
        <>
          <p className="small text-muted mb-2">{mode === 'live' ? 'Live calls' : 'Test calls'} in the last {data.window.days} days.</p>
          <div className="row g-3 mb-4">
            {data.kpis.map((k) => <div className="col-6 col-md-4 col-xl-3" key={k.key}><KpiTile kpi={k} /></div>)}
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <SectionCard title="Success by engine" icon="cpu-line">
                {data.byEngine.length === 0 ? <p className="text-muted small mb-0">No calls in this window.</p> : (
                  <div className="table-responsive">
                    <table className="table table-sm mb-0">
                      <thead className="table-light"><tr><th scope="col">Engine</th><th scope="col" className="text-end">Attempted</th><th scope="col" className="text-end">Completed</th><th scope="col" className="text-end">Success</th></tr></thead>
                      <tbody>
                        {data.byEngine.map((e) => (
                          <tr key={e.engine}><td>{ENGINE_LABEL[e.engine] ?? e.engine}</td><td className="text-end">{e.attempted}</td><td className="text-end">{e.completed}</td><td className="text-end">{e.successPercent === null ? 'No data' : `${e.successPercent}%`}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </SectionCard>
            </div>
            <div className="col-lg-3 col-md-6">
              <SectionCard title="Safety switches" icon="shield-check-line">
                <ul className="list-unstyled small mb-0 d-grid gap-2" data-testid="safety">
                  <li className="d-flex justify-content-between gap-2">Customer calls on our engines <StatusBadge label={data.safety.studioEnabled ? 'On' : 'Off'} tone={data.safety.studioEnabled ? 'warning' : 'neutral'} /></li>
                  <li className="d-flex justify-content-between gap-2">Test calls <StatusBadge label={data.safety.testEnabled ? 'On' : 'Off'} tone={data.safety.testEnabled ? 'info' : 'neutral'} /></li>
                  <li className="d-flex justify-content-between gap-2">Legacy gateway <StatusBadge label={data.safety.gatewayLegacyEnabled ? 'On' : 'Off'} tone="neutral" /></li>
                  <li className="d-flex justify-content-between gap-2">Default engine <span>{ENGINE_LABEL[data.safety.engineDefault] ?? data.safety.engineDefault}</span></li>
                </ul>
              </SectionCard>
            </div>
            <div className="col-lg-3 col-md-6">
              <SectionCard title="Migration from Synthflow" icon="route-line">
                {data.migration.total === 0 ? <p className="text-muted small mb-0" data-testid="migration-empty">No routes are registered yet.</p> : (
                  <ul className="list-unstyled small mb-0 d-grid gap-1" data-testid="migration">
                    {(['legacy', 'shadow', 'test', 'canary', 'live', 'disabled'] as const).map((k) => (
                      <li key={k} className="d-flex justify-content-between"><span className="text-capitalize">{k}</span><span>{data.migration[k]} of {data.migration.total}</span></li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          </div>
        </>
      )}
    </>
  );
}
