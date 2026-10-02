import React, { useCallback, useEffect, useState } from 'react';
import { SectionCard } from '../shell';
import {
  listLinksForCaseStudy, suggestServiceLinks, decideServiceLink,
  type ServiceLink,
} from '../../../services/caseStudyServiceLinkApi';

/**
 * CaseStudyServiceLinksPanel — which of Colaberry's services this record is evidence for.
 *
 * Ali, 2026-10-02: "make sure the case studies are linked to our services so we can make that connection for
 * later when we are looking to link our case studies with the services we provide." The chosen shape was
 * suggest-then-confirm, and this panel is the suggest-and-review end of it; the service-side view of the same
 * links lives in `ServiceEvidencePanel`, reached from Our Services.
 *
 * WHY A CONFIRM STEP EXISTS AT ALL. A confirmed link is quotable as past performance in a government bid. The
 * suggestion behind it is keyword and capability overlap computed by a deterministic matcher, which is a decent
 * prompt to look and no kind of warrant that this record proves that service. So the panel never presents a
 * suggestion as a link: suggestions sit under their own heading, carry the overlap that produced them, and wait
 * for a person. Nothing here writes a confirmation on anyone's behalf.
 *
 * SUGGESTING IS SAFE TO REPEAT. The server only inserts pairs that have no row yet and never touches one already
 * decided, so the button reports what it actually added rather than claiming a result. A second press adds
 * nothing, and the panel says so instead of going quiet.
 */

const STATE_BADGE: Record<ServiceLink['state'], string> = {
  confirmed: 'bg-success-subtle text-success-emphasis',
  suggested: 'bg-warning-subtle text-warning-emphasis',
  rejected: 'bg-secondary-subtle text-secondary-emphasis',
};
const STATE_LABEL: Record<ServiceLink['state'], string> = {
  confirmed: 'Confirmed',
  suggested: 'Suggested',
  rejected: 'Dismissed',
};

function LinkRow({ link, onDecide, busy }: {
  link: ServiceLink;
  onDecide?: (state: 'confirmed' | 'rejected') => void;
  busy: boolean;
}): React.ReactElement {
  return (
    <li className="list-group-item px-0">
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-2">
        <div className="flex-grow-1" style={{ minWidth: '14rem' }}>
          <div className="fw-semibold">
            {link.serviceName}
            {link.serviceCategory && (
              <span className="badge bg-secondary-subtle text-secondary-emphasis ms-2">{link.serviceCategory}</span>
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
          <span className={`badge ${STATE_BADGE[link.state]}`}>{STATE_LABEL[link.state]}</span>
          {onDecide && (
            <div className="btn-group btn-group-sm" role="group" aria-label={`Decide ${link.serviceName}`}>
              <button type="button" className="btn btn-outline-success" disabled={busy} onClick={() => onDecide('confirmed')}>
                <i className="ri-check-line me-1" aria-hidden="true" />Confirm
              </button>
              <button type="button" className="btn btn-outline-secondary" disabled={busy} onClick={() => onDecide('rejected')}>
                <i className="ri-close-line me-1" aria-hidden="true" />Dismiss
              </button>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

export default function CaseStudyServiceLinksPanel({ caseStudyId }: { caseStudyId: string }): React.ReactElement {
  const [links, setLinks] = useState<ServiceLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setLinks(await listLinksForCaseStudy(caseStudyId));
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not load the service links.');
    } finally {
      setLoading(false);
    }
  }, [caseStudyId]);

  useEffect(() => { void load(); }, [load]);

  const onSuggest = useCallback(async () => {
    setSuggesting(true);
    setError(null);
    setNote(null);
    try {
      const res = await suggestServiceLinks(caseStudyId);
      setLinks(res.links);
      // Reports what the server actually did. "Nothing new" is a real, useful outcome on a second press, and
      // saying it plainly is better than a success message that implies work happened.
      setNote(
        res.inserted > 0
          ? `Proposed ${res.inserted} new link${res.inserted === 1 ? '' : 's'} for review.`
          : res.links.length > 0
            ? 'Nothing new to propose. Every overlap already has a row here.'
            : 'No service in the catalog overlaps this record.',
      );
    } catch (err: any) {
      setError(err?.response?.data?.error ?? 'Could not suggest service links.');
    } finally {
      setSuggesting(false);
    }
  }, [caseStudyId]);

  const decide = useCallback(async (id: string, state: 'confirmed' | 'rejected') => {
    setBusyId(id);
    setError(null);
    try {
      const updated = await decideServiceLink(id, state);
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
    <SectionCard
      title="Services this record evidences"
      subtitle="Only confirmed links should be quoted as past performance. Suggestions are keyword and capability overlap, nothing more."
      icon="links-line"
      actions={
        <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => void onSuggest()} disabled={suggesting}>
          <i className="ri-magic-line me-1" aria-hidden="true" />
          {suggesting ? 'Looking…' : 'Suggest services'}
        </button>
      }
    >
      {error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center" role="alert">
          <span>{error}</span>
          <button type="button" className="btn-close" aria-label="Dismiss error" onClick={() => setError(null)} />
        </div>
      )}
      {note && (
        <div className="alert alert-info d-flex justify-content-between align-items-center" role="status">
          <span>{note}</span>
          <button type="button" className="btn-close" aria-label="Dismiss message" onClick={() => setNote(null)} />
        </div>
      )}

      {loading ? (
        <p className="text-secondary mb-0">Loading service links…</p>
      ) : links.length === 0 ? (
        <div className="text-center py-4">
          <i className="ri-links-line fs-2 text-secondary" aria-hidden="true" />
          <p className="text-secondary mt-2 mb-0">
            No services linked yet. Run <strong>Suggest services</strong> to see which offerings this record overlaps.
          </p>
        </div>
      ) : (
        <>
          <h6 className="text-uppercase small text-secondary">
            Confirmed <span className="text-body-secondary">({confirmed.length})</span>
          </h6>
          {confirmed.length === 0 ? (
            <p className="small text-secondary">Nothing confirmed yet.</p>
          ) : (
            <ul className="list-group list-group-flush mb-3">
              {confirmed.map((l) => <LinkRow key={l.id} link={l} busy={busyId === l.id} />)}
            </ul>
          )}

          {suggested.length > 0 && (
            <>
              <h6 className="text-uppercase small text-secondary mt-3">
                Suggested, not yet reviewed <span className="text-body-secondary">({suggested.length})</span>
              </h6>
              <ul className="list-group list-group-flush mb-3">
                {suggested.map((l) => (
                  <LinkRow key={l.id} link={l} busy={busyId === l.id} onDecide={(s) => void decide(l.id, s)} />
                ))}
              </ul>
            </>
          )}

          {dismissed.length > 0 && (
            <details>
              <summary className="text-uppercase small text-secondary">Dismissed ({dismissed.length})</summary>
              <p className="small text-secondary mt-2 mb-2">Kept so the same weak match is not proposed again.</p>
              <ul className="list-group list-group-flush">
                {dismissed.map((l) => <LinkRow key={l.id} link={l} busy={busyId === l.id} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </SectionCard>
  );
}
