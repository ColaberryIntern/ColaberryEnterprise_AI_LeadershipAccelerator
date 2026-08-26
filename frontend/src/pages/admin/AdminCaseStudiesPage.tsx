import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader, SectionCard, StatusBadge } from '../../components/admin/shell';
import {
  CaseStudyCreatePanel, CaseStudyDashboard, CaseStudyStateTabs,
  SCAN_LIMIT, applyLens, formatDate, needsConsent, scanRowFrom, stateByKey,
} from '../../components/admin/caseStudy';
import type { CaseStudyScanRow } from '../../components/admin/caseStudy';
import {
  createCaseStudyFromProject, createCaseStudyFromRepositories, describeApiError,
  getCaseStudy, listCaseStudies,
} from '../../services/caseStudyAdminApi';
import type { CaseStudyCreateResult, CaseStudySummary } from '../../services/caseStudyAdminTypes';

/**
 * AdminCaseStudiesPage — the Case Study OS worklist (spec §18).
 *
 * FOUR EMPTY STATES, FOUR SENTENCES. Loading, load-failed, filtered-empty and
 * genuinely-empty each say something different. "No Case Studies yet" is a claim
 * about the database and must never appear because a request failed: the admin
 * leads page shipped that collapse and told an operator their database was empty
 * against 24,244 real rows.
 *
 * THE DASHBOARD SCOPE IS A SEPARATE REQUEST. Indicator counts must not move
 * because somebody clicked a tab, so the dashboard reads its own unfiltered page
 * of records and says how many it covered. Everything the list endpoint cannot
 * answer (repositories, readiness, sync state) is read record-by-record in an
 * explicit, bounded scan and shows "Not scanned" until it has run.
 */

const PAGE_SIZE = 25;
/** The dashboard's population. Stated on screen; never implied. */
const SCOPE_SIZE = 100;

function AdminCaseStudiesPage(): React.ReactElement {
  const [stateKey, setStateKey] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);

  const [rows, setRows] = useState<readonly CaseStudySummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [scope, setScope] = useState<readonly CaseStudySummary[]>([]);
  const [scopeTotal, setScopeTotal] = useState(0);
  const [scan, setScan] = useState<ReadonlyMap<string, CaseStudyScanRow>>(new Map());
  const [scanned, setScanned] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanFailures, setScanFailures] = useState(0);

  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<CaseStudyCreateResult | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const state = stateByKey(stateKey);

  // Debounced so typing a title is not one request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const fetchRows = useCallback(async () => {
    const query = stateByKey(stateKey).query;
    try {
      const data = await listCaseStudies({
        ...query, ...(search ? { search } : {}), limit: PAGE_SIZE, offset,
      });
      setRows(data.items);
      setTotal(data.total);
      setLoadError(null);
    } catch (err) {
      // Surfaced, never swallowed into an empty list.
      setLoadError(describeApiError(err, 'Case Studies'));
      setRows([]);
      setTotal(0);
    }
  }, [stateKey, search, offset]);

  useEffect(() => {
    setLoading(true);
    fetchRows().finally(() => setLoading(false));
  }, [fetchRows]);

  const loadScope = useCallback(async () => {
    try {
      const data = await listCaseStudies({
        includeArchived: true, limit: SCOPE_SIZE, offset: 0,
      });
      setScope(data.items);
      setScopeTotal(data.total);
    } catch {
      // The dashboard degrades to nothing rather than to invented zeroes; the
      // table's own error line already tells the operator the API is unhappy.
      setScope([]);
      setScopeTotal(0);
    }
  }, []);

  useEffect(() => { void loadScope(); }, [loadScope]);

  /**
   * Read each scoped record so the indicators that need a record can be
   * measured. Bounded to SCAN_LIMIT, tolerant per record: a record that cannot
   * be read is counted and reported, not silently dropped from a total.
   */
  const runScan = useCallback(async () => {
    const targets = scope.slice(0, SCAN_LIMIT);
    setScanning(true);
    const settled = await Promise.allSettled(targets.map((row) => getCaseStudy(row.id)));
    const next = new Map<string, CaseStudyScanRow>();
    let failures = 0;
    settled.forEach((outcome) => {
      if (outcome.status === 'fulfilled') {
        const scanRow = scanRowFrom(outcome.value);
        next.set(scanRow.id, scanRow);
      } else {
        failures += 1;
      }
    });
    setScan(next);
    setScanFailures(failures);
    setScanned(true);
    setScanning(false);
  }, [scope]);

  // The two lens states cannot be answered without reading records, so selecting
  // one runs the scan rather than showing a filter that quietly omits everything.
  useEffect(() => {
    if (state.lens !== 'evidence' && state.lens !== 'sync') return;
    if (scanned || scanning || scope.length === 0) return;
    void runScan();
  }, [state.lens, scanned, scanning, scope.length, runScan]);

  const create = async (run: () => Promise<CaseStudyCreateResult>) => {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await run();
      setCreateResult(result);
      await fetchRows();
      await loadScope();
    } catch (err) {
      setCreateResult(null);
      setCreateError(describeApiError(err, 'this Case Study candidate'));
    } finally {
      setCreating(false);
    }
  };

  const visible = applyLens(rows, state.lens, scan);
  const hasFilters = search !== '' || stateKey !== 'all';
  const lensNeedsScan = (state.lens === 'evidence' || state.lens === 'sync') && !scanned;

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Case Studies"
        icon="award-line"
        subtitle="Candidates, evidence, consent and publication for the Case Study OS. Nothing here is public until a human approves it and the publish gate allows it."
        breadcrumb={[{ label: 'Admin', to: '/admin/dashboard' }, { label: 'Case Studies' }]}
      />

      <CaseStudyDashboard
        scope={scope} scopeTotal={scopeTotal} scan={scan} scanned={scanned} scanning={scanning}
        scanFailures={scanFailures} onScan={() => { void runScan(); }}
        activeState={stateKey}
        onSelectState={(key) => { setStateKey(key); setOffset(0); }}
      />

      <CaseStudyCreatePanel
        busy={creating}
        result={createResult}
        error={createError}
        onCreateFromProject={(body) => create(() => createCaseStudyFromProject(body))}
        onCreateFromRepositories={(body) => create(() => createCaseStudyFromRepositories(body))}
      />

      <SectionCard title="Candidates" icon="list-check-2" padded={false}>
        <div className="p-3 border-bottom">
          <CaseStudyStateTabs
            active={stateKey}
            onSelect={(key) => { setStateKey(key); setOffset(0); }}
            visibleCount={visible.length}
            total={total}
          />
          <label className="form-label" htmlFor="cs-search">Search title or slug</label>
          <input
            id="cs-search" data-testid="cs-search" className="form-control"
            placeholder="Claims triage..." value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {lensNeedsScan && (
            <p className="small text-warning mb-0 mt-2" data-testid="cs-lens-needs-scan">
              This state is derived from the desk scan, which has not finished. Until it does,
              nothing is listed here — an unscanned record is unknown, not clean.
            </p>
          )}
        </div>

        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead>
              <tr>
                <th>Title</th>
                <th>Source</th>
                <th>Industry</th>
                <th>Capability</th>
                <th className="text-end">Repos</th>
                <th className="text-end">Readiness</th>
                <th>Consent</th>
                <th>Status</th>
                <th>Publication</th>
                <th>Last sync</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="text-center text-muted py-4">
                    Loading Case Studies...
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  {/* Four states, four sentences. A failed request must never
                      render as a statement about what the database contains. */}
                  <td
                    colSpan={10}
                    className={`text-center py-4 ${loadError ? 'text-danger' : 'text-muted'}`}
                  >
                    {loadError
                      ? loadError
                      : hasFilters
                        ? `No Case Studies match the "${state.label}" state${search ? ` and the search "${search}"` : ''}.`
                        : 'No Case Studies exist yet. Create one from a Project or from a repository collection above.'}
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const scanRow = scan.get(row.id);
                  return (
                    <tr key={row.id} data-testid={`cs-row-${row.id}`}>
                      <td className="fw-bold">
                        <Link to={`/admin/case-studies/${row.id}`}>{row.title}</Link>
                        <div className="small text-muted">{row.slug}</div>
                      </td>
                      <td className="small">{row.sourceType}</td>
                      <td className="small">{row.industry || '—'}</td>
                      <td className="small">{row.primaryCapability || '—'}</td>
                      <td className="text-end small">{scanRow ? scanRow.repoCount : '—'}</td>
                      <td className="text-end small">
                        {scanRow && scanRow.readinessScore !== null
                          ? `${scanRow.readinessScore} (${scanRow.readinessBand})`
                          : '—'}
                      </td>
                      <td>
                        {needsConsent(row)
                          ? <StatusBadge label="Consent missing" tone="danger" />
                          : <StatusBadge label="Consent ok" tone="success" />}
                      </td>
                      <td><StatusBadge label={row.status} /></td>
                      <td className="small">{scanRow ? scanRow.publicationState : '—'}</td>
                      <td className="small text-muted">
                        {scanRow ? formatDate(scanRow.lastSyncedAt) : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="d-flex justify-content-between align-items-center p-3 border-top">
          <span className="small text-muted">
            Showing {visible.length} of {total}. Repos, readiness, publication and last sync are
            blank until the desk scan has read that record.
          </span>
          <div className="btn-group">
            <button
              type="button" className="btn btn-sm btn-outline-secondary" disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              Previous
            </button>
            <button
              type="button" className="btn btn-sm btn-outline-secondary"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              Next
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

export default AdminCaseStudiesPage;
