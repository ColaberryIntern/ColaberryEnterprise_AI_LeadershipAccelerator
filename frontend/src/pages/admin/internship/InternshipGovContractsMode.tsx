import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SectionCard, StatusBadge, EmptyState } from '../../../components/admin/shell';
import type { Tone } from '../../../components/admin/shell/StatusBadge';
import { fetchGovContracts, errorMessage, type GovContractCard, type GovContractStage } from '../../../services/adminGovContractsApi';

/**
 * Gov Contracts mode — the admin Interns hub's government-pursuit index (mgmt-portal M1).
 *
 * One card per active government pursuit in the gov container: its stage, agency, requirements
 * and build progress, with "Open cockpit" into the full pursuit workspace (/admin/gov-qualification)
 * where the read-only status view, the proposal workspace and the AI drafting helper already live.
 * This tab is the index those mature screens never had; it does not re-embed them.
 *
 * Access is two-layered: the tab is gated `gov_contracts` (owner/admin today); the list the server
 * returns is already scoped — a management/operator viewer gets every pursuit, a scoped viewer only
 * the projects they are assigned to. `scope === 'member'` says the list is the narrowed one.
 */

const STAGE_META: Record<GovContractStage, { label: string; tone: Tone }> = {
  qualifying: { label: 'Qualifying', tone: 'info' },
  ready_to_assign: { label: 'Ready to assign', tone: 'warning' },
  in_build: { label: 'In build', tone: 'primary' },
  passed: { label: 'Passed on', tone: 'neutral' },
};

const InternshipGovContractsMode: React.FC = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<GovContractCard[] | null>(null);
  const [scope, setScope] = useState<'all' | 'member'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGovContracts();
      setProjects(res.projects);
      setScope(res.scope);
    } catch (err: unknown) {
      setError(errorMessage(err, 'Could not load government contracts.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="aint-state">Loading government contracts…</div>;

  if (error) {
    return (
      <div className="aint-state error">
        <p>{error}</p>
        <button type="button" className="aint-btn" onClick={load}>Try again</button>
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return (
      <EmptyState
        icon="government-line"
        title="No active government pursuits"
        description={
          scope === 'member'
            ? 'You are not assigned to a government project yet. One will appear here once a build is assigned to you.'
            : 'No government pursuit is in flight yet. Approve a bid pursuit in the gov workspace and it will show up here.'
        }
      />
    );
  }

  return (
    <div className="d-flex flex-column gap-3">
      <p className="text-muted mb-0" style={{ fontSize: '0.85rem' }}>
        {scope === 'member'
          ? 'Showing only the government projects you are assigned to.'
          : 'Every active government pursuit, newest activity first. Open a pursuit to work its requirements, proposal and build.'}
      </p>
      {projects.map((p) => {
        const stage = STAGE_META[p.stage];
        return (
          <SectionCard
            key={p.key}
            title={p.title ?? p.key}
            subtitle={p.agency ?? p.biddingEntity}
            icon="government-line"
            actions={
              <button
                type="button"
                className="btn btn-outline-primary btn-sm"
                onClick={() => navigate(`/admin/gov-qualification?canonical=${encodeURIComponent(p.key)}`)}
              >
                Open cockpit
              </button>
            }
          >
            <div className="d-flex flex-wrap align-items-center gap-3">
              <StatusBadge label={stage.label} tone={stage.tone} />
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                {p.establishedCount} requirement{p.establishedCount === 1 ? '' : 's'} established
              </span>
              <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                {p.pursuitKind === 'services' ? 'Services' : 'Software'} pursuit
              </span>
              {p.zipAttested && <StatusBadge label="ZIP attested" tone="success" />}
              {p.build && (
                <span className="text-muted" style={{ fontSize: '0.85rem' }}>
                  Build {p.build.pct}% ({p.build.verified}/{p.build.total} stories verified)
                </span>
              )}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
};

export default InternshipGovContractsMode;
