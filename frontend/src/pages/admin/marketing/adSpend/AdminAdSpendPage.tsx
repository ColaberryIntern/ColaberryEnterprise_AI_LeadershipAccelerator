import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../../../components/admin/shell';
import { getSpendLedger, type SpendLedger } from '../../../../services/adSpendApi';
import AdSpendForm from './AdSpendForm';
import AdSpendImport from './AdSpendImport';
import AdSpendTable from './AdSpendTable';
import MetaSyncPanel from './MetaSyncPanel';

/**
 * /admin/marketing/ad-spend - where the team records what the ads cost.
 *
 * Three ways in, one ledger: type it, import the Ads Manager export, or let the Meta sync pull it.
 * The report (Marketing -> Performance -> "Are the ads paying for themselves?") reads this ledger
 * and uses one source per campaign per day, preferring Meta, then imports, then typed figures.
 *
 * Reached from the Marketing overview and the report, not the sidebar, which keeps the one
 * Marketing button (2026-10-08).
 */
export default function AdminAdSpendPage() {
  const [data, setData] = useState<SpendLedger | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getSpendLedger());
    } catch {
      setError('Ad spend could not be loaded.');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <PageHeader
        title="Ad spend"
        icon="money-dollar-box-line"
        subtitle="What the ads cost, per campaign per day, so the report can say whether they pay for themselves."
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Ad spend' }]}
        actions={<Link to="/admin/marketing/performance" className="btn btn-sm btn-outline-secondary">See profitability</Link>}
      />
      {error && (
        <div className="alert alert-danger py-2 d-flex align-items-center gap-2" role="alert">
          <span>{error}</span>
          <button type="button" className="btn btn-sm btn-outline-danger ms-auto" onClick={load}>Try again</button>
        </div>
      )}
      {!data && !error && <p className="text-muted">Loading…</p>}
      {data && (
        <>
          <div className="row g-3 mb-3">
            <div className="col-lg-6">
              <SectionCard title="Pull from Meta" icon="refresh-line">
                <MetaSyncPanel status={data.sync} onSynced={load} />
              </SectionCard>
            </div>
            <div className="col-lg-6">
              <SectionCard title="Import an export" icon="upload-2-line">
                <AdSpendImport onImported={load} />
              </SectionCard>
            </div>
          </div>
          <SectionCard title="Add spend by hand" subtitle="One day or a range. A range is spread evenly across its days." icon="edit-line" className="mb-3">
            <AdSpendForm knownCampaigns={data.knownCampaigns} onSaved={load} />
          </SectionCard>
          <SectionCard title="Recorded spend" subtitle={`${data.from} to ${data.to}. Where sources overlap, the report counts one per campaign per day: Meta, then imports, then typed.`} icon="list-check-2">
            {data.total > data.records.length && (
              <p className="small text-muted">Showing the newest {data.records.length} of {data.total} rows. The report reads all of them.</p>
            )}
            <AdSpendTable records={data.records} onChanged={load} />
          </SectionCard>
        </>
      )}
    </>
  );
}
