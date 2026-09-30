import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import RelatedWorkClustersPanel from '../RelatedWorkClustersPanel';
import { RelatedWorkClusters } from '../../../services/workLedgerApi';

// ProofDesk Outcomes & Learning — Milestone 5 (T010). Matches
// GovernanceShadowPanel.smoke.test.tsx's convention.

describe('RelatedWorkClustersPanel — loading state', () => {
  it('renders a spinner, not the cluster content', () => {
    const html = renderToStaticMarkup(<RelatedWorkClustersPanel clusters={null} loading={true} error={null} onRefresh={() => {}} />);
    expect(html).toContain('spinner-border');
    expect(html).not.toContain('By shared entity');
  });
});

describe('RelatedWorkClustersPanel — error state', () => {
  it('renders the error message, not a crash or stale content', () => {
    const html = renderToStaticMarkup(
      <RelatedWorkClustersPanel clusters={null} loading={false} error="Failed to load related-work clusters" onRefresh={() => {}} />,
    );
    expect(html).toContain('Failed to load related-work clusters');
  });
});

describe('RelatedWorkClustersPanel — boundary: no clusters detected', () => {
  it('renders the honest empty-state message, not a fabricated cluster', () => {
    const empty: RelatedWorkClusters = { entity_clusters: [], resource_clusters: [] };
    const html = renderToStaticMarkup(<RelatedWorkClustersPanel clusters={empty} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('No clusters detected');
  });
});

describe('RelatedWorkClustersPanel — happy path: entity + resource clusters', () => {
  it('renders both cluster dimensions with ticket ids and counts', () => {
    const clusters: RelatedWorkClusters = {
      entity_clusters: [{ entity_type: 'curriculum_card', entity_id: 'card-42', ticket_ids: ['t1', 't2'] }],
      resource_clusters: [{ target_id: 'backend/src/services/ticketService.ts', ticket_ids: ['t3', 't4'] }],
    };
    const html = renderToStaticMarkup(<RelatedWorkClustersPanel clusters={clusters} loading={false} error={null} onRefresh={() => {}} />);
    expect(html).toContain('By shared entity');
    expect(html).toContain('curriculum_card');
    expect(html).toContain('card-42');
    expect(html).toContain('t1, t2');
    expect(html).toContain('By shared resource');
    expect(html).toContain('backend/src/services/ticketService.ts');
    expect(html).toContain('t3, t4');
  });
});
