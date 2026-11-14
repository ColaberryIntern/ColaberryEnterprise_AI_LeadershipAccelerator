import React from 'react';
import type { EvidenceCaseStudy } from '../../../services/ourServicesApi';
import { industryIcon } from './ourServicesModel';
import { useCaseStudyOpener } from './caseStudyOpener';

/**
 * CaseStudyCard - one confirmed case study under a service: an industry thumbnail, the Inside/Drive source badge,
 * the year, the title and the headline metric. An outside metric is a claim from a document, so an unverified
 * metric says so. Glyphs are RemixIcon icons (house style forbids emoji in product copy).
 */
interface Props { cs: EvidenceCaseStudy }

export const SOURCE_PILL = {
  inside: { label: 'Inside', icon: 'ri-building-2-line', className: 'bg-info-subtle text-info-emphasis' },
  outside: { label: 'Drive', icon: 'ri-folder-3-line', className: 'bg-secondary-subtle text-secondary-emphasis' },
} as const;

/** The Inside / Drive pill, optionally with a different label (for example "Outside · Google Drive"). */
export function SourcePill({ kind, label, className = '', title }: { kind: 'inside' | 'outside'; label?: React.ReactNode; className?: string; title?: string }): React.ReactElement {
  const p = SOURCE_PILL[kind];
  return (
    <span className={`badge rounded-pill ${p.className} ${className}`} title={title}>
      <i className={`${p.icon} me-1`} aria-hidden="true" />{label ?? p.label}
    </span>
  );
}

/** Where an admin reads one case study. Inside and outside records both live on the same review desk. */
export const caseStudyHref = (id: string): string => `/admin/case-studies/${encodeURIComponent(id)}`;

/**
 * The case-study title as a link. On Our Services (inside CaseStudyOpenerContext) a plain click opens the case study
 * in the page's side panel, so a half-ticked Intake card or an expanded catalog row stays put. Ctrl/Cmd/middle click,
 * or any page without the provider, still opens the full record in a new tab.
 */
export function CaseStudyTitleLink({ id, title, className = '' }: { id: string; title: string; className?: string }): React.ReactElement {
  const open = useCaseStudyOpener();
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>): void => {
    if (!open || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open(id);
  };
  return (
    <a href={caseStudyHref(id)} target="_blank" rel="noopener noreferrer" onClick={onClick}
      className={`link-body-emphasis link-underline-opacity-25 link-underline-opacity-100-hover ${className}`}
      data-testid={`open-case-study-${id}`}>
      {title}<i className={`${open ? 'ri-side-bar-line' : 'ri-external-link-line'} ms-1 small text-body-secondary`} aria-hidden="true" />
      <span className="visually-hidden">{open ? ' (opens the case study in a side panel)' : ' (opens the case study in a new tab)'}</span>
    </a>
  );
}

export default function CaseStudyCard({ cs }: Props): React.ReactElement {
  const m = cs.headlineMetric;
  return (
    <article className="border rounded-3 overflow-hidden bg-body h-100 d-flex flex-column">
      <div className={`position-relative d-flex align-items-center justify-content-center ${cs.sourceKind === 'inside' ? 'bg-info-subtle' : 'bg-secondary-subtle'}`} style={{ height: 78 }}>
        <SourcePill kind={cs.sourceKind} className="position-absolute top-0 start-0 m-2 border" />
        {cs.year != null && <span className="badge bg-body text-body position-absolute top-0 end-0 m-2">{cs.year}</span>}
        <i className={`${industryIcon(cs.industry)} fs-2 text-body-secondary`} aria-hidden="true" />
      </div>
      <div className="p-2 px-3">
        <div className="fw-bold small lh-sm"><CaseStudyTitleLink id={cs.id} title={cs.title} /></div>
        <div className="small text-secondary">{cs.industry ?? 'Industry not set'}{cs.status ? ` · ${cs.status}` : ''}</div>
        {m && (
          <div className={`small fw-semibold mt-1 ${m.verified ? 'text-success-emphasis' : 'text-body-secondary'}`}>
            {m.verified && <i className="ri-check-line me-1" aria-hidden="true" />}{m.label}{m.value ? `: ${m.value}` : ''}{m.verified ? '' : ' (unverified)'}
          </div>
        )}
      </div>
    </article>
  );
}
