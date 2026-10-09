import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard, EmptyState } from '../../components/admin/shell';
import {
  getAdminToolsOverview,
  type AdminToolsOverview,
  type ToolCatalogEntry,
} from '../../services/agentEffectiveAccessApi';
import AdminToolsCatalogTable from '../../components/admin/tools/AdminToolsCatalogTable';
import AdminToolsDriftSection from '../../components/admin/tools/AdminToolsDriftSection';

/**
 * AdminToolsPage — Reese manager-growth mission, Phase 3 (T09/T10). The
 * fleet-wide "effective access" view: every real tool/capability authority
 * source this phase's discovery found, reconciled into one honest report,
 * consumed here read-only (T11's admin registration/assignment write surface
 * is explicitly out of scope this phase — see execution-contract.md).
 *
 * New top-level admin page, not nested in any single agent's detail page —
 * matches the existing /admin/workforce org-chart page's own precedent for a
 * fleet-wide surface (execution-contract.md Assumption 4). Built on the
 * standard Bootstrap admin shell (PageHeader/SectionCard/StatusBadge/
 * EmptyState), matching AdminLeadsPage.tsx's own established table+filter
 * pattern, rather than WorkforceOSPage.tsx's bespoke visual system — this
 * page is a search/filter/table view, not a distinct product surface.
 */
export default function AdminToolsPage() {
  const [overview, setOverview] = useState<AdminToolsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminToolsOverview();
      setOverview(data);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to load the tools overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredTools: ToolCatalogEntry[] = useMemo(() => {
    if (!overview) return [];
    const q = search.trim().toLowerCase();
    if (!q) return overview.tools;
    return overview.tools.filter(
      (t) =>
        t.toolName.toLowerCase().includes(q) ||
        t.assignedAgents.some((a) => a.agentName.toLowerCase().includes(q)),
    );
  }, [overview, search]);

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title="Tools"
        subtitle="Every real tool/capability grant across the fleet, reconciled honestly across its real, scattered sources. Read-only — assignment and registration aren't built here yet."
        icon="tools-line"
      />

      <div className="row g-3 mb-3">
        <div className="col-md-6 col-lg-4">
          <input
            type="search"
            className="form-control"
            placeholder="Search by tool or agent name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search tools"
          />
        </div>
      </div>

      {loading && (
        <SectionCard>
          <div className="text-center text-muted py-4">
            <div className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
            Loading the tools overview…
          </div>
        </SectionCard>
      )}

      {!loading && error && (
        <SectionCard>
          <EmptyState icon="error-warning-line" title="Couldn't load the tools overview" description={error} actionLabel="Retry" onAction={load} />
        </SectionCard>
      )}

      {!loading && !error && overview && (
        <>
          <SectionCard
            title={`Tool catalog (${filteredTools.length} of ${overview.tools.length})`}
            subtitle="Registered, granted, and usable are shown separately — a tool can be true on one and false on another."
          >
            {filteredTools.length === 0 ? (
              <EmptyState
                icon="search-line"
                title={overview.tools.length === 0 ? 'No tools found' : 'No tools match your search'}
                description={overview.tools.length === 0 ? 'Nothing is registered or granted anywhere in the fleet yet.' : 'Try a different tool or agent name.'}
                tone="quiet"
              />
            ) : (
              <AdminToolsCatalogTable tools={filteredTools} />
            )}
          </SectionCard>

          <AdminToolsDriftSection findings={overview.driftFindings} />
        </>
      )}
    </div>
  );
}
