import React from 'react';
import type { CapabilityItem } from '../../../services/factoryApi';

/**
 * FitProofLine (Services Upgrade SV3.5) - the proof under one Fit capability.
 *   - "We have it": the matched service's CONFIRMED case studies as chips (`evidence[]`). An empty list says so,
 *     because a "have" with no linked case study is a claim nobody has backed yet.
 *   - "Partly" / "New": "Possible unlinked proof" (`possibleProof[]`, deterministic keyword overlap on the server)
 *     with a link into Our Services Intake, where a person can link it.
 * Both fields are additive (SV2); an older saved Fit without them renders nothing here.
 *
 * A plain anchor, not a router Link: the panel is also rendered in tests and embeds without a router, and the
 * hand-off to another page is a full navigation either way.
 */
export const INTAKE_HREF = '/admin/gov-services#intake';

const SRC = { inside: { label: '🏗️ Inside', className: 'bg-info-subtle text-info-emphasis' }, outside: { label: '📁 Drive', className: 'bg-secondary-subtle text-secondary-emphasis' } } as const;

export function FitProofLine({ cap }: { cap: CapabilityItem }): React.ReactElement | null {
  if (cap.assessment === 'have') {
    if (!cap.evidence) return null;
    if (!cap.evidence.length) {
      return <div className="small text-secondary mt-1">No confirmed case study is linked to this service yet. <a href={INTAKE_HREF}>Link one in Our Services</a>.</div>;
    }
    return (
      <div className="d-flex flex-wrap gap-1 align-items-center mt-1" aria-label="Confirmed case studies">
        <span className="small text-secondary me-1">Proof:</span>
        {cap.evidence.map((e) => (
          <span key={e.caseStudyId} className={`badge rounded-pill fw-normal ${SRC[e.sourceKind].className}`}>{SRC[e.sourceKind].label} · {e.title}</span>
        ))}
      </div>
    );
  }
  if (!cap.possibleProof || !cap.possibleProof.length) return null;
  return (
    <div className="small mt-2 p-2 rounded-2 bg-warning-subtle text-warning-emphasis">
      <span aria-hidden="true">💡 </span><strong>Possible unlinked proof:</strong>{' '}
      {cap.possibleProof.map((p, i) => (
        <span key={p.caseStudyId}>
          {i > 0 && '; '}{p.title} ({p.sourceKind === 'inside' ? 'Inside' : 'Drive'}{p.linkedElsewhere ? ', linked to another service' : ', waiting in Intake'})
        </span>
      ))}
      . <a href={INTAKE_HREF} className="text-warning-emphasis fw-semibold">Review in Our Services Intake →</a>
    </div>
  );
}
