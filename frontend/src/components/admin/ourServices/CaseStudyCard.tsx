import React from 'react';
import type { EvidenceCaseStudy } from '../../../services/ourServicesApi';
import { industryEmoji } from './ourServicesModel';

/**
 * CaseStudyCard - one confirmed case study under a service: an industry thumbnail, the Inside/Drive source badge,
 * the year, the title and the headline metric. An outside metric is a claim from a document, so an unverified
 * metric says so.
 */
interface Props { cs: EvidenceCaseStudy }

export const SOURCE_PILL = {
  inside: { label: '🏗️ Inside', className: 'bg-info-subtle text-info-emphasis' },
  outside: { label: '📁 Drive', className: 'bg-secondary-subtle text-secondary-emphasis' },
} as const;

export default function CaseStudyCard({ cs }: Props): React.ReactElement {
  const pill = SOURCE_PILL[cs.sourceKind];
  const m = cs.headlineMetric;
  return (
    <article className="border rounded-3 overflow-hidden bg-body h-100 d-flex flex-column">
      <div className={`position-relative d-flex align-items-center justify-content-center ${cs.sourceKind === 'inside' ? 'bg-info-subtle' : 'bg-secondary-subtle'}`} style={{ height: 78 }}>
        <span className={`badge rounded-pill position-absolute top-0 start-0 m-2 border ${pill.className}`}>{pill.label}</span>
        {cs.year != null && <span className="badge bg-body text-body position-absolute top-0 end-0 m-2">{cs.year}</span>}
        <span className="fs-2" aria-hidden="true">{industryEmoji(cs.industry)}</span>
      </div>
      <div className="p-2 px-3">
        <div className="fw-bold small lh-sm">{cs.title}</div>
        <div className="small text-secondary">{cs.industry ?? 'Industry not set'}{cs.status ? ` · ${cs.status}` : ''}</div>
        {m && (
          <div className={`small fw-semibold mt-1 ${m.verified ? 'text-success-emphasis' : 'text-body-secondary'}`}>
            {m.verified ? '✔ ' : ''}{m.label}{m.value ? `: ${m.value}` : ''}{m.verified ? '' : ' (unverified)'}
          </div>
        )}
      </div>
    </article>
  );
}
