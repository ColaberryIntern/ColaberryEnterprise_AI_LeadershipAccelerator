import React from 'react';
import { QueueBucket } from '../../../services/adminInternshipApi';
import { useReview } from './reviewContext';
import InternshipQueue from './InternshipQueue';
import InternshipDetailPanel from './InternshipDetailPanel';

/**
 * The Applications view: a KPI filter row above a fixed queue and a detail pane.
 * The KPIs filter the queue and never clear the open applicant (the old page
 * cleared selection on every KPI click).
 */
const InternshipApplicationsMode: React.FC = () => {
  const r = useReview();
  return (
    <div>
      {r.kpis && r.kpis.length > 0 && (
        <div className="aint-kpis">
          {r.kpis.map((k) => (
            <button
              key={k.key}
              type="button"
              className={`aint-kpi${k.drilldown.bucket && r.bucket === k.drilldown.bucket ? ' on' : ''}`}
              onClick={() => { if (k.drilldown.bucket) r.setBucket(k.drilldown.bucket as QueueBucket); }}
              disabled={!k.drilldown.bucket}
              title={k.reason ?? undefined}
            >
              <div className="v">{k.reliability === 'unknown' ? '—' : k.count}</div>
              <div className="l">{k.label}</div>
              {k.reliability === 'unknown' && <div className="u">not measured</div>}
            </button>
          ))}
        </div>
      )}

      <div className={`aint-master${r.selected ? ' show' : ''}`}>
        <InternshipQueue />
        <InternshipDetailPanel onBack={() => r.setSelected(null)} />
      </div>
    </div>
  );
};

export default InternshipApplicationsMode;
