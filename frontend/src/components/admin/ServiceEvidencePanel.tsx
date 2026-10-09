import React, { useCallback, useEffect, useState } from 'react';
import {
  listCaseStudiesForService, decideServiceLink,
  type ServiceLink, type ServiceLinkState,
} from '../../services/caseStudyServiceLinkApi';

/**
 * ServiceEvidencePanel — "what proves this service?" for one service offering.
 *
 * Its own component rather than more markup inside AdminGovServicesPage, which is already near this repo's
 * 300-line soft target.
 *
 * THE DESIGN JOB HERE IS ONE DISTINCTION, held visually at all times: a SUGGESTED link is something the system
 * noticed from keyword and capability overlap, and a CONFIRMED link is something a person stood behind. Only the
 * second is quotable as past performance in a bid. So confirmed evidence leads the panel, suggestions sit below it
 * under a heading that calls them unreviewed, and every suggestion shows the overlap that produced it next to the
 * buttons that accept or dismiss it. A reviewer should never have to remember which kind they are looking at.
 *
 * Colours come from Bootstrap's subtle/emphasis token pairs, which hold their contrast in both themes. A bare
 * `text-success` on white is the pattern that already failed WCAG AA elsewhere in this product.
 */

const STATE_LABEL: Record<ServiceLinkState, string> = {
  confirmed: 'Confirmed',
  suggested: 'Suggested',
  rejected: 'Dismissed',
};

const STATE_BADGE: Record<ServiceLinkState, string> = {
  confirmed: 'bg-success-subtle text-success-emphasis',
  suggested: 'bg-warning-subtle text-warning-emphasis',
  rejected: 'bg-secondary-subtle text-secondary-emphasis',
};

function StateBadge({ state }: { state: ServiceLinkState }): React.ReactElement {
  return <span className={`badge ${STATE_BADGE[state]}`}>{STATE_LABEL[state]}</span>;
}

/** One row. `onDecide` is absent for anything already decided, so the buttons simply do not render. */
function EvidenceRow({ link, onDecide, busy }: {
  link: ServiceLink;
  onDecide?: (state: 'confirmed' | 'rejected') => void;
  busy: boolean;
}): React.ReactElement {
  const archived = link.caseStudyStatus === 'archived';
  return (
    <li className="list-group-item px-0">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div className="flex-grow-1" style={{ minWidth: '14rem' }}>
          <div className="fw-semibold">
            {link.caseStudyTitle}
            {archived && (
              <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2" title="This record is archived">
                Archived
              </span>
            )}
          </div>
          {link.rationale && <div className="small text-secondary mt-1">{link.rationale}</div>}
          {link.decidedBy && (
            <div className="small text-secondary mt-1">
              <i className="ri-user-received-line me-1" aria-hidden="true" />
              {STATE_LABEL[link.state]} by {link.decidedBy}
            </div>
          )}
        </div>
        <div className="d-flex align-items-center gap-2">
          <StateBadge state={link.state} />
          {onDecide && (
            <div className="btn-group btn-group-sm" role="group" aria-label={`Decide ${link.caseStudyTitle}`}>
              <button
                type="button"
                className="btn btn-outline-success"
                disabled={busy}
                onClick={() => onDecide('confirmed')}
              >
                <i className="ri-check-line me-1" aria-hidden="true" />Confirm
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={busy}
                onClick={() => onDecide('rejected')}
              >
                <i className="ri-close-line me-1" aria-hidden="true" />Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function ServiceEvidencePanel({ serviceId, serviceName, onClose }: {
  serviceId: string;
  serviceName: string;
  onClose: () => void;
}): React.ReactElement {
  const [links, setLinks] = useState<ServiceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await listCaseStudiesForService(serviceId));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the evidence for this service.');
    } finally {
      setLoading(false);
    }
  }, [serviceId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const decide = useCallback(async (id: string, state: 'confirmed' | 'rejected') => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await decideServiceLink(id, state);
      // Replace the one row from the server's response rather than re-fetching: the decision is already recorded,
      // and a reload here would make a slow list flash for a change that affects a single row.
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not record that decision.');
    } finally {
      setBusyId(null);
    }
  }, []);

  const confirmed = links.filter((l) => l.state === 'confirmed');
  const suggested = links.filter((l) => l.state === 'suggested');
  const dismissed = links.filter((l) => l.state === 'rejected');

  return (
    <div
      className="modal fade show d-block"
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Evidence for ${serviceName}`}
      style={{ background: 'rgba(0,0,0,.5)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
        role="document"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header">
            <div>
              <h5 className="modal-title">{serviceName}</h5>
              <div className="small text-secondary">Case studies offered as evidence for this service</div>
            </div>
            <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
          </div>

          <div className="modal-body">
            {error && (
              <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
                <span>{error}</span>
                <button type="button" className="btn-close" aria-label="Dismiss error" onClick={() => setError(null)} />
              </div>
            )}

            {loading ? (
              <p className="text-secondary mb-0">Loading evidence…</p>
            ) : links.length === 0 ? (
              <div className="text-center py-4">
                <i className="ri-link-unlink fs-2 text-secondary" aria-hidden="true" />
                <p className="text-secondary mt-2 mb-0">
                  Nothing is linked to this service yet. Run the suggestion pass from a case study to propose links.
                </p>
              </div>
            ) : (
              <>
                <h6 className="text-uppercase small text-secondary">
                  Confirmed evidence <span className="text-body-secondary">({confirmed.length})</span>
                </h6>
                {confirmed.length === 0 ? (
                  <p className="small text-secondary">
                    Nothing confirmed yet. Only confirmed links should be quoted as past performance.
                  </p>
                ) : (
                  <ul className="list-group list-group-flush mb-3">
                    {confirmed.map((l) => <EvidenceRow key={l.id} link={l} busy={busyId === l.id} />)}
                  </ul>
                )}

                {suggested.length > 0 && (
                  <>
                    <h6 className="text-uppercase small text-secondary mt-3">
                      Suggested, not yet reviewed <span className="text-body-secondary">({suggested.length})</span>
                    </h6>
                    <p className="small text-secondary mb-2">
                      Proposed from keyword and capability overlap. Confirm only what the record genuinely proves.
                    </p>
                    <ul className="list-group list-group-flush mb-3">
                      {suggested.map((l) => (
                        <EvidenceRow
                          key={l.id}
                          link={l}
                          busy={busyId === l.id}
                          onDecide={(state) => void decide(l.id, state)}
                        />
                      ))}
                    </ul>
                  </>
                )}

                {dismissed.length > 0 && (
                  <details>
                    <summary className="text-uppercase small text-secondary">
                      Dismissed ({dismissed.length})
                    </summary>
                    <p className="small text-secondary mt-2 mb-2">
                      Kept so the same weak match is not proposed again.
                    </p>
                    <ul className="list-group list-group-flush">
                      {dismissed.map((l) => <EvidenceRow key={l.id} link={l} busy={busyId === l.id} />)}
                    </ul>
                  </details>
                )}
              </>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
