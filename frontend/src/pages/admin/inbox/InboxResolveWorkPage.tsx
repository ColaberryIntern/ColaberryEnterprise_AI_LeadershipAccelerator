import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard, StatCard } from '../../../components/admin/shell';
import { useToast } from '../../../components/ui/ToastProvider';
import { inboxCaseApi, CaseMode, CaseState, DiscoveryWindow, InboxCaseRecord, CaseStats, DiscoveredCaseSummary } from '../../../services/inboxCaseApi';
import CaseWorkspacePanel from '../../../components/admin/inbox/resolve/CaseWorkspacePanel';

// Resolve Work — the first/default tab of Inbox COS (root directive section
// 4). Landing state: mode toggle, search, window selector, discover, recent
// case list, KPIs. Selecting a case switches into the 3-pane case workspace.

const STATE_TONE: Record<CaseState, string> = {
  DISCOVERING: 'secondary', ASSESSING: 'info', NEEDS_ALI: 'warning', READY_TO_PLAN: 'info',
  AWAITING_APPROVAL: 'warning', EXECUTING: 'primary', WAITING: 'warning', DELEGATED: 'info',
  RESOLVED: 'success', FAILED: 'danger', REOPENED: 'warning',
};

function StateBadge({ state }: { state: CaseState }) {
  const tone = STATE_TONE[state] || 'secondary';
  return <span className={`badge bg-${tone}`}>{state.replace(/_/g, ' ')}</span>;
}

export default function InboxResolveWorkPage() {
  const { showToast } = useToast();
  const [mode, setMode] = useState<CaseMode>('PERSON');
  const [query, setQuery] = useState('');
  const [windowOpt, setWindowOpt] = useState<DiscoveryWindow>('90d');
  const [discovering, setDiscovering] = useState(false);
  const [discoveredSummaries, setDiscoveredSummaries] = useState<DiscoveredCaseSummary[] | null>(null);

  const [cases, setCases] = useState<InboxCaseRecord[]>([]);
  const [stats, setStats] = useState<CaseStats | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<CaseState | ''>('');

  const loadList = useCallback(async () => {
    try {
      setLoadingList(true);
      const [listRes, statsRes] = await Promise.all([
        inboxCaseApi.list(stateFilter ? { state: stateFilter } : {}),
        inboxCaseApi.stats(),
      ]);
      setCases(listRes.cases);
      setStats(statsRes);
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to load cases', 'error');
    } finally {
      setLoadingList(false);
    }
  }, [stateFilter, showToast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  const handleDiscover = async () => {
    if (!query.trim()) {
      showToast('Enter a person name/email or a topic to search for', 'error');
      return;
    }
    try {
      setDiscovering(true);
      setDiscoveredSummaries(null);
      const result = await inboxCaseApi.discover(mode, query.trim(), windowOpt);
      setDiscoveredSummaries(result.cases);
      showToast(`Found ${result.cases.length} case${result.cases.length === 1 ? '' : 's'}`, 'success');
      loadList();
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Discovery failed', 'error');
    } finally {
      setDiscovering(false);
    }
  };

  if (selectedCaseId) {
    return (
      <CaseWorkspacePanel
        caseId={selectedCaseId}
        onBack={() => {
          setSelectedCaseId(null);
          loadList();
        }}
      />
    );
  }

  return (
    <div>
      {stats && (
        <div className="row g-3 mb-3">
          <div className="col-6 col-lg-3">
            <StatCard label="Open cases" value={stats.total - stats.resolved} icon="folder-open-line" tone="primary" hint="Not yet resolved" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Needs you" value={stats.needs_ali} icon="user-question-line" tone="warning" hint="Blocking questions" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Waiting" value={stats.waiting} icon="time-line" tone="info" hint="Owed by someone else" />
          </div>
          <div className="col-6 col-lg-3">
            <StatCard label="Failed actions" value={stats.failed} icon="error-warning-line" tone="danger" hint="Needs a retry" />
          </div>
        </div>
      )}

      <SectionCard title="Resolve Work" subtitle="Resolve everything involving a person, company, or initiative — across email and Basecamp — as one case." icon="search-eye-line" className="mb-3">
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3" role="group" aria-label="Search mode">
          <div className="btn-group" role="group" aria-label="Person or topic">
            <button
              type="button"
              className={`btn btn-sm ${mode === 'PERSON' ? 'btn-primary' : 'btn-outline-primary'}`}
              aria-pressed={mode === 'PERSON'}
              onClick={() => setMode('PERSON')}
            >
              <i className="ri-user-line" aria-hidden="true" /> Person
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === 'TOPIC' ? 'btn-primary' : 'btn-outline-primary'}`}
              aria-pressed={mode === 'TOPIC'}
              onClick={() => setMode('TOPIC')}
            >
              <i className="ri-building-line" aria-hidden="true" /> Topic / Company
            </button>
          </div>

          <label className="visually-hidden" htmlFor="resolve-query-input">
            {mode === 'PERSON' ? 'Person name or email' : 'Topic, company, or initiative'}
          </label>
          <input
            id="resolve-query-input"
            data-testid="resolve-query-input"
            type="text"
            className="form-control form-control-sm"
            style={{ maxWidth: 320 }}
            placeholder={mode === 'PERSON' ? 'e.g. Kes' : 'e.g. AI Flotation LLC'}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleDiscover()}
          />

          <label className="visually-hidden" htmlFor="resolve-window-select">Discovery window</label>
          <select
            id="resolve-window-select"
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            value={windowOpt}
            onChange={(e) => setWindowOpt(e.target.value as DiscoveryWindow)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="1y">Last year</option>
            <option value="all">All time</option>
          </select>

          <button type="button" data-testid="resolve-discover-button" className="btn btn-sm btn-primary" onClick={handleDiscover} disabled={discovering}>
            {discovering ? (
              <>
                <span className="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" /> Discovering…
              </>
            ) : (
              <>
                <i className="ri-radar-line" aria-hidden="true" /> Discover Related Work
              </>
            )}
          </button>
        </div>

        {discoveredSummaries && (
          <div className="border rounded p-2 bg-light" role="status" aria-live="polite" data-testid="discovery-results">
            {discoveredSummaries.length === 0 ? (
              <div className="text-muted small">No related work found for "{query}" in the selected window.</div>
            ) : (
              <div className="d-flex flex-column gap-2">
                {discoveredSummaries.map((s) => (
                  <button
                    key={s.caseId}
                    type="button"
                    data-testid="discovered-case-link"
                    className="btn btn-outline-primary btn-sm text-start d-flex justify-content-between align-items-center"
                    onClick={() => setSelectedCaseId(s.caseId)}
                  >
                    <span>{s.title}</span>
                    <span className="text-muted small">
                      {s.includedCount} confirmed · {s.candidateCount} candidate{s.candidateCount === 1 ? '' : 's'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Cases"
        icon="folder-2-line"
        actions={
          <select
            className="form-select form-select-sm"
            style={{ width: 'auto' }}
            aria-label="Filter cases by state"
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as CaseState | '')}
          >
            <option value="">All states</option>
            <option value="NEEDS_ALI">Needs you</option>
            <option value="AWAITING_APPROVAL">Awaiting approval</option>
            <option value="WAITING">Waiting</option>
            <option value="FAILED">Failed</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        }
      >
        {loadingList ? (
          <div className="text-center py-4">
            <div className="spinner-border spinner-border-sm text-primary" role="status">
              <span className="visually-hidden">Loading cases…</span>
            </div>
          </div>
        ) : cases.length === 0 ? (
          <div className="text-center py-4 text-muted small">No cases yet. Search above to discover related work.</div>
        ) : (
          <div className="table-responsive">
            <table className="table table-hover mb-0">
              <thead className="table-light">
                <tr>
                  <th>Case</th>
                  <th>Mode</th>
                  <th>State</th>
                  <th>Opened</th>
                </tr>
              </thead>
              <tbody>
                {cases.map((c) => (
                  <tr
                    key={c.id}
                    data-testid="case-row"
                    style={{ cursor: 'pointer' }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open case: ${c.title}`}
                    onClick={() => setSelectedCaseId(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCaseId(c.id);
                      }
                    }}
                  >
                    <td className="small fw-semibold">{c.title}</td>
                    <td className="small text-muted">{c.mode}</td>
                    <td><StateBadge state={c.state} /></td>
                    <td className="small text-muted">{new Date(c.opened_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
