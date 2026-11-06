import React from 'react';
import StoryDetailArticle from '../publicV2/StoryDetailArticle';
import type { CaseStudyLinkedPerson } from '../../services/caseStudyAdminTypes';
import type { PublicCaseStudyDetail, PublicSurfaceView } from '../../services/caseStudyPublicTypes';

/**
 * HirePersonFirstPreview — the PREVIEW tab's HIRE lens.
 *
 * hire.refactored.ai is PERSON-FIRST (PROMPT §1.3): an employer arrives to decide about the
 * builder, so the builder leads and the project is their evidence. This draws the person
 * band and the proof ledger ABOVE the record, then the record itself in HIRE_ORDER through
 * the same `StoryDetailArticle` every surface uses - the order comes from `surface`, which
 * is the server's hire profile, never from this file.
 *
 * INERT, like the rest of the preview frame: Request intro is a disabled button, and no
 * link here goes anywhere. The person comes from the backend's allow-list projection, so
 * the admin sees exactly what a stranger would - and when the record resolves to nobody,
 * the refusal band says so in the words the publish gate will also use.
 */

export const NO_PERSON_COPY = 'No person is linked. This record cannot be listed on Hire.';

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
}

const GOLD = '#B7860B';

function Avatar({ person }: { person: CaseStudyLinkedPerson }): React.ReactElement {
  const size = 88;
  return (
    <span
      className="position-relative d-inline-grid flex-shrink-0"
      style={{ width: size, height: size, placeItems: 'center' }}
      data-testid="cs-hire-avatar"
    >
      {/* The gold ring and the star: being listed is the badge. */}
      <span
        aria-hidden="true"
        className="position-absolute rounded-circle"
        style={{ inset: -4, background: `conic-gradient(from 210deg, ${GOLD}, #1F76B4, ${GOLD})` }}
      />
      <span
        className="position-relative rounded-circle d-grid fw-semibold text-white overflow-hidden"
        style={{ width: size, height: size, placeItems: 'center', background: '#345', fontSize: 30 }}
      >
        {person.avatarUrl && /^(https:\/\/|data:image\/)/.test(person.avatarUrl)
          ? <img src={person.avatarUrl} alt={person.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          : <span aria-hidden="true">{initials(person.name)}</span>}
      </span>
      <span
        aria-hidden="true"
        className="position-absolute rounded-circle d-grid"
        style={{ right: -2, bottom: -2, width: 26, height: 26, placeItems: 'center', background: GOLD, color: '#1d1503', border: '3px solid #fff' }}
        title="Case-study verified"
      >
        ★
      </span>
    </span>
  );
}

function ProofTile({ value, label, gold }: { value: number | null; label: string; gold?: boolean }): React.ReactElement | null {
  if (value === null) return null;
  return (
    <div className="col-6 col-md-3">
      <div className="border rounded-3 p-3 h-100 bg-white">
        <div className="fs-3 fw-semibold font-monospace" style={gold ? { color: GOLD } : undefined}>{value}</div>
        <div className="small text-muted">{label}</div>
      </div>
    </div>
  );
}

export interface HirePersonFirstPreviewProps {
  person: CaseStudyLinkedPerson | null;
  projection: PublicCaseStudyDetail;
  surface: PublicSurfaceView;
}

export default function HirePersonFirstPreview({
  person, projection, surface,
}: HirePersonFirstPreviewProps): React.ReactElement {
  if (!person) {
    return (
      <>
        <div className="alert alert-warning d-flex gap-2 align-items-start" role="status" data-testid="cs-hire-refusal">
          <span aria-hidden="true">★</span>
          <div>
            <strong>{NO_PERSON_COPY}</strong>
            <div className="small mt-1">
              Link the case study&apos;s repository to the builder&apos;s project (github_connections),
              or set case_studies.project_id. The publish gate refuses Hire until one of them is true.
            </div>
          </div>
        </div>
        <StoryDetailArticle record={projection} surface={surface} />
      </>
    );
  }

  const where = person.listed
    ? 'Listed in the directory'
    : person.pageVisibility === 'unlisted' && person.pageStatus === 'published'
      ? 'Reachable by direct link only (unlisted)'
      : 'Not listed yet: the portfolio is not published and public';

  return (
    <>
      <section className="border rounded-3 p-4 mb-3 bg-light" data-testid="cs-hire-person-band" aria-label="The builder">
        <div className="d-flex flex-wrap gap-4 align-items-center">
          <Avatar person={person} />
          <div className="flex-grow-1">
            <span
              className="badge rounded-pill mb-2"
              style={{ background: 'rgba(183,134,11,.12)', color: GOLD, border: `1px solid ${GOLD}` }}
            >
              ★ Case-study verified · {person.proof.publishedCaseStudies} published
              {person.spotlight ? ' · Spotlight' : ''}
            </span>
            <h3 className="h4 mb-0 font-monospace" data-testid="cs-hire-person-name">{person.name}</h3>
            {person.role && <div className="fw-semibold text-primary">{person.role}</div>}
            <div className="small text-muted d-flex flex-wrap gap-3 mt-1">
              {person.cohort && <span>Cohort · {person.cohort}</span>}
              {person.availability && <span data-testid="cs-hire-availability">{person.availability.label}</span>}
              <span>{where} · /talent/{person.portfolioSlug}/</span>
            </div>
          </div>
          {/* Inert, like every control in the preview frame. */}
          <button type="button" className="btn btn-primary" disabled aria-disabled="true">Request intro</button>
        </div>
        <div className="row g-3 mt-2" data-testid="cs-hire-proof-ledger">
          <ProofTile value={person.proof.publishedCaseStudies} label="published case studies" gold />
          <ProofTile value={person.proof.verifiedCommits} label="verified commits" />
          <ProofTile value={person.proof.capabilitiesProven} label="capabilities proven in code" />
          <ProofTile value={person.proof.filesCommitted} label="files committed" />
        </div>
      </section>
      <StoryDetailArticle record={projection} surface={surface} />
    </>
  );
}
