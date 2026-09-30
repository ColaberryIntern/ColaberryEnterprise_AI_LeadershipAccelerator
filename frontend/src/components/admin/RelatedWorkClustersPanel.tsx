import React from 'react';
import { SectionCard } from './shell';
import { RelatedWorkClusters } from '../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (spec 20.9). Pure/presentational, same
// convention as GovernanceShadowPanel.tsx. Both cluster dimensions are real,
// data-driven groupings of currently-open tickets — an empty result is the honest,
// common case, not a placeholder.

interface Props {
  clusters: RelatedWorkClusters | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function RelatedWorkClustersPanel({ clusters, loading, error, onRefresh }: Props) {
  const hasClusters = !!clusters && (clusters.entity_clusters.length > 0 || clusters.resource_clusters.length > 0);

  return (
    <SectionCard padded={false} className="mt-4">
      <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center">
        <span>Related-work clusters</span>
        <button className="btn btn-outline-primary btn-sm" onClick={onRefresh} disabled={loading}>
          <i className="ri-refresh-line" aria-hidden="true" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      ) : error ? (
        <div className="alert alert-danger mx-3 my-3">{error}</div>
      ) : !hasClusters ? (
        <div className="text-muted text-center py-4 px-3">
          No clusters detected — no two open tickets currently share an entity or a touched
          resource.
        </div>
      ) : (
        <div className="px-3 pb-3">
          {clusters!.entity_clusters.length > 0 && (
            <div className="mb-3">
              <div className="fw-semibold small text-muted mb-2">By shared entity</div>
              {clusters!.entity_clusters.map((c) => (
                <div key={`${c.entity_type}-${c.entity_id}`} className="border rounded p-2 mb-2">
                  <code>{c.entity_type}</code> = <code>{c.entity_id}</code>
                  <span className="ms-2 badge bg-info text-dark">{c.ticket_ids.length} tickets</span>
                  <div className="small text-muted mt-1">{c.ticket_ids.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
          {clusters!.resource_clusters.length > 0 && (
            <div>
              <div className="fw-semibold small text-muted mb-2">By shared resource</div>
              {clusters!.resource_clusters.map((c) => (
                <div key={c.target_id} className="border rounded p-2 mb-2">
                  <code>{c.target_id}</code>
                  <span className="ms-2 badge bg-info text-dark">{c.ticket_ids.length} tickets</span>
                  <div className="small text-muted mt-1">{c.ticket_ids.join(', ')}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}
