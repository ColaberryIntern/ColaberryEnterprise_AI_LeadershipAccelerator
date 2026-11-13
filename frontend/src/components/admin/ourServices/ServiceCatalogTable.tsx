import React, { useState } from 'react';
import { EmptyState } from '../shell';
import type { EvidenceService } from '../../../services/ourServicesApi';
import CaseStudyCard, { SOURCE_PILL } from './CaseStudyCard';
import { TIER_META, freshnessOf, matchesTone, nonRetired, confirmedCount, type Freshness } from './ourServicesModel';

/**
 * ServiceCatalogTable - the catalog with its evidence. Filters: Active / Growth / Needs evidence (score under 40) /
 * All (includes retired). Rows sort strongest first; a row expands into its confirmed case-study cards.
 * Actions keep the existing Evidence / Edit / Retire, plus Promote on growth rows, which stays disabled until the
 * service has at least one confirmed case study (the server enforces the same rule with a 409).
 */
export type CatalogFilter = 'active' | 'growth' | 'weak' | 'all';
export const CATALOG_FILTERS: Array<{ key: CatalogFilter; label: string }> = [
  { key: 'active', label: 'Active' }, { key: 'growth', label: 'Growth 🌱' }, { key: 'weak', label: 'Needs evidence ⚠️' }, { key: 'all', label: 'All' },
];
export const WEAK_BELOW = 40;

/** PURE: the rows a filter shows, strongest first. */
export function filterCatalog(services: EvidenceService[], filter: CatalogFilter): EvidenceService[] {
  const rows = filter === 'all' ? services
    : filter === 'weak' ? nonRetired(services).filter((s) => s.evidenceScore < WEAK_BELOW)
      : services.filter((s) => s.status === filter);
  return [...rows].sort((a, b) => b.evidenceScore - a.evidenceScore || a.name.localeCompare(b.name));
}

const FRESH: Record<Freshness, { dot: string; className: string }> = {
  fresh: { dot: '🟢', className: 'text-success-emphasis' },
  recent: { dot: '🟡', className: 'text-warning-emphasis' },
  stale: { dot: '🔴', className: 'text-danger-emphasis' },
  none: { dot: '🔴', className: 'text-danger-emphasis' },
};
const TONE_TEXT = { danger: 'text-danger-emphasis', warning: 'text-warning-emphasis', muted: 'text-secondary' } as const;

interface Props {
  services: EvidenceService[];
  descriptions: Record<string, string | null | undefined>;
  currentYear: number;
  filter: CatalogFilter;
  onFilter: (f: CatalogFilter) => void;
  busyId: string | null;
  onEvidence: (s: EvidenceService) => void;
  onEdit: (s: EvidenceService) => void;
  onRetire: (s: EvidenceService) => void;
  onPromote: (s: EvidenceService) => void;
  onAddService: () => void;
}

export function CatalogFilterTabs({ filter, onFilter }: Pick<Props, 'filter' | 'onFilter'>): React.ReactElement {
  return (
    <div className="btn-group btn-group-sm" role="group" aria-label="Catalog filter">
      {CATALOG_FILTERS.map((f) => (
        <button key={f.key} type="button" aria-pressed={filter === f.key} className={`btn ${filter === f.key ? 'btn-dark' : 'btn-outline-secondary'}`} onClick={() => onFilter(f.key)}>{f.label}</button>
      ))}
    </div>
  );
}

export default function ServiceCatalogTable(p: Props): React.ReactElement {
  const [open, setOpen] = useState<string | null>(null);
  const rows = filterCatalog(p.services, p.filter);
  const maxMatches = Math.max(0, ...p.services.map((s) => s.openOpportunityMatches ?? 0));

  if (!p.services.length) {
    return <EmptyState icon="service-line" title="No services yet." description="Add your first offering so opportunities can be matched against it." actionLabel="Add your first service" onAction={p.onAddService} />;
  }
  if (!rows.length) {
    const msg = p.filter === 'growth' ? 'No growth services. A service proposed from a case study starts here.'
      : p.filter === 'weak' ? 'No service is below 40. Every service has solid evidence.'
        : 'No services match this filter.';
    return <EmptyState icon="filter-off-line" tone="quiet" title={msg} />;
  }
  return (
    <div className="table-responsive">
      <table className="table table-hover align-top mb-0" style={{ fontSize: '.875rem' }}>
        <thead>
          <tr className="text-uppercase text-secondary" style={{ fontSize: '.7rem', letterSpacing: '.06em' }}>
            {['Service', 'Status', 'Evidence', 'Case studies', 'Freshest proof', 'Industries', 'NAICS', 'Gov matches', 'Actions'].map((h) => (
              <th key={h} scope="col" className="text-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const tier = TIER_META[s.evidenceTier];
            const fresh = freshnessOf(s.newestEvidenceYear, p.currentYear);
            const isOpen = open === s.id;
            const proof = confirmedCount(s);
            const detailId = `svc-detail-${s.id}`;
            return (
              <React.Fragment key={s.id}>
                <tr className={s.status === 'retired' ? 'opacity-50' : undefined} data-testid={`catalog-row-${s.id}`}>
                  <td style={{ minWidth: 240 }}>
                    <button type="button" className="btn btn-link p-0 text-start text-body fw-bold text-decoration-none" aria-expanded={isOpen} aria-controls={detailId} onClick={() => setOpen(isOpen ? null : s.id)}>
                      {s.name} <span className="text-secondary small" aria-hidden="true">{isOpen ? '▾' : '▸'}</span>
                    </button>
                    {p.descriptions[s.id] && <div className="small text-secondary" style={{ maxWidth: 360 }}>{p.descriptions[s.id]}</div>}
                  </td>
                  <td>
                    {s.status === 'growth' ? <span className="badge rounded-pill bg-info-subtle text-info-emphasis">🌱 Growth</span>
                      : s.status === 'retired' ? <span className="badge rounded-pill bg-secondary-subtle text-secondary-emphasis">Retired</span>
                        : <span className={`badge rounded-pill ${tier.pill}`}>{tier.label}</span>}
                  </td>
                  <td style={{ minWidth: 130 }}>
                    <span className={`fw-bold ${tier.text}`}>{s.evidenceScore}</span>
                    <div className="progress mt-1" style={{ height: 8, width: 120 }} role="progressbar" aria-label={`Evidence score for ${s.name}`} aria-valuenow={s.evidenceScore} aria-valuemin={0} aria-valuemax={100}>
                      <div className="progress-bar" style={{ width: `${s.evidenceScore}%`, background: tier.fill }} />
                    </div>
                  </td>
                  <td className="text-nowrap">
                    <span className={`badge rounded-pill me-1 ${SOURCE_PILL.inside.className}`} title="Inside case studies (confirmed)">🏗️ {s.insideCount}</span>
                    <span className={`badge rounded-pill ${SOURCE_PILL.outside.className}`} title="Outside case studies (confirmed)">📁 {s.outsideCount}</span>
                  </td>
                  <td className={`small fw-bold text-nowrap ${FRESH[fresh].className}`}>
                    <span aria-hidden="true">{FRESH[fresh].dot} </span>{s.newestEvidenceYear ?? 'none'}
                  </td>
                  <td>
                    <div className="d-flex flex-wrap gap-1">
                      {s.industries.length ? s.industries.map((i) => <span key={i.industry} className="badge bg-body-tertiary text-body-secondary fw-normal border">{i.industry}</span>) : <span className="text-secondary">—</span>}
                    </div>
                  </td>
                  <td className="small text-secondary">{s.naicsCodes.length ? s.naicsCodes.join(', ') : '—'}</td>
                  <td className="text-nowrap">
                    {s.openOpportunityMatches == null
                      ? <span className="text-secondary" title="Open opportunity matches are not available right now">—</span>
                      : <><b className={TONE_TEXT[matchesTone(s.openOpportunityMatches, maxMatches)]}>{s.openOpportunityMatches}</b> <span className="small text-secondary">open</span></>}
                  </td>
                  <td>
                    {/* Icon buttons keep the row to one line; the label stays in the accessible name. */}
                    <div className="d-flex flex-nowrap gap-1">
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => p.onEvidence(s)} title="Case studies offered as evidence for this service"><i className="ri-links-line" aria-hidden="true" /><span className="visually-hidden">Evidence</span></button>
                      <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => p.onEdit(s)} title="Edit this service"><i className="ri-edit-line" aria-hidden="true" /><span className="visually-hidden">Edit</span></button>
                      {s.status === 'growth' && (
                        <span className="d-inline-block" title={proof ? 'Make this service active' : 'Link at least one confirmed case study before promoting'} tabIndex={proof ? undefined : 0}>
                          <button type="button" className="btn btn-outline-success btn-sm" disabled={!proof || p.busyId === s.id}
                            aria-describedby={proof ? undefined : `promote-why-${s.id}`} onClick={() => p.onPromote(s)} style={proof ? undefined : { pointerEvents: 'none' }}>
                            <i className="ri-arrow-up-circle-line" aria-hidden="true" /><span className="visually-hidden">Promote</span>
                          </button>
                          {!proof && <span id={`promote-why-${s.id}`} className="visually-hidden">Needs one confirmed case study first.</span>}
                        </span>
                      )}
                      {s.status !== 'retired' && (
                        <button type="button" className="btn btn-outline-danger btn-sm" disabled={p.busyId === s.id} onClick={() => p.onRetire(s)} title="Hide this service (reversible: edit keeps its data)">
                          <i className="ri-archive-line" aria-hidden="true" /><span className="visually-hidden">Retire</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && (
                  <tr id={detailId}>
                    <td colSpan={9} className="bg-body-tertiary">
                      {s.caseStudies.length ? (
                        <div className="row g-3 py-1">
                          {s.caseStudies.map((cs) => <div key={cs.id} className="col-12 col-md-6 col-xl-3"><CaseStudyCard cs={cs} /></div>)}
                        </div>
                      ) : (
                        <div className="border border-2 border-danger-subtle rounded-3 p-3 text-danger-emphasis fw-semibold bg-body" style={{ borderStyle: 'dashed' }}>
                          ⚠️ No case study linked yet. In proposals this service shows as <b>Partly</b>. Link one from Intake, or import one from Drive.
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
