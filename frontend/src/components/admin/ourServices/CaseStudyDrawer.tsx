import React, { useEffect, useRef, useState } from 'react';
import { getCaseStudy } from '../../../services/caseStudyAdminApi';
import type { CaseStudySummary } from '../../../services/caseStudyAdminTypes';
import { listLinksForCaseStudy, type ServiceLink } from '../../../services/caseStudyServiceLinkApi';
import { getCaseStudySourceFile } from '../../../services/ourServicesApi';
import { SourcePill, caseStudyHref } from './CaseStudyCard';

/**
 * CaseStudyDrawer - read one case study without leaving Our Services. It works for both groups:
 *   - Inside (built in Project Factory): the summary, industry, capability and which services it is linked to.
 *   - Outside (an imported whitepaper): the same, plus the ORIGINAL document. A PDF is shown in the panel; a DOCX or
 *     PPTX is offered as a download.
 * READ-ONLY: nothing here confirms, publishes or edits. Linking still happens on the Intake card. Escape, the close
 * button or a click on the backdrop closes it. The full record (all tabs) opens in a new tab.
 */
export interface DrawerSeed { id: string; title: string; sourceKind: 'inside' | 'outside' }

interface Props { seed: DrawerSeed; onClose: () => void }

type Doc = { url: string; type: string } | 'none' | 'error' | null;

const LINK_BADGE: Record<ServiceLink['state'], string> = {
  confirmed: 'bg-success-subtle text-success-emphasis', suggested: 'bg-warning-subtle text-warning-emphasis', rejected: 'bg-secondary-subtle text-secondary-emphasis',
};
const LINK_LABEL: Record<ServiceLink['state'], string> = { confirmed: 'Linked', suggested: 'Suggested', rejected: 'Dismissed' };

const failMsg = (e: unknown, fallback: string): string => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

export default function CaseStudyDrawer({ seed, onClose }: Props): React.ReactElement {
  const [record, setRecord] = useState<CaseStudySummary | null>(null);
  const [links, setLinks] = useState<ServiceLink[] | null>(null);
  const [doc, setDoc] = useState<Doc>(seed.sourceKind === 'outside' ? null : 'none');
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const outside = seed.sourceKind === 'outside';

  useEffect(() => {
    let alive = true;
    let objectUrl: string | null = null;
    setRecord(null); setLinks(null); setError(null); setDoc(outside ? null : 'none');
    getCaseStudy(seed.id).then((d) => { if (alive) setRecord(d.caseStudy); }).catch((e) => { if (alive) setError(failMsg(e, 'Could not load this case study.')); });
    listLinksForCaseStudy(seed.id).then((l) => { if (alive) setLinks(l); }).catch(() => { if (alive) setLinks([]); });
    if (outside) {
      getCaseStudySourceFile(seed.id)
        .then((b) => {
          if (!alive) return;
          if (!b) { setDoc('none'); return; }
          objectUrl = URL.createObjectURL(b);
          setDoc({ url: objectUrl, type: b.type });
        })
        .catch(() => { if (alive) setDoc('error'); });
    }
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [seed.id, outside]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const pdf = doc && typeof doc === 'object' && doc.type.includes('pdf');
  const ext = doc && typeof doc === 'object' ? (doc.type.includes('word') ? 'docx' : doc.type.includes('presentation') ? 'pptx' : 'pdf') : 'pdf';
  const visibleLinks = (links ?? []).filter((l) => l.state !== 'rejected');

  return (
    <>
      <div className="offcanvas-backdrop fade show" onClick={onClose} aria-hidden="true" />
      <aside className="offcanvas offcanvas-end show" role="dialog" aria-modal="true" aria-labelledby="cs-drawer-title"
        style={{ visibility: 'visible', width: 'min(760px, 100vw)' }} data-testid="case-study-drawer">
        <div className="offcanvas-header border-bottom align-items-start gap-3">
          <div className="flex-grow-1">
            <div className="d-flex flex-wrap gap-2 align-items-center mb-1">
              <SourcePill kind={seed.sourceKind} label={outside ? 'Outside · whitepaper' : 'Inside · Project Factory'} />
              {record && <span className="badge bg-body-tertiary text-body-secondary border">{record.status}</span>}
              {outside && <span className="small text-secondary"><i className="ri-lock-line me-1" aria-hidden="true" />Internal only, never published</span>}
            </div>
            <h2 id="cs-drawer-title" className="h5 mb-0">{record?.title ?? seed.title}</h2>
          </div>
          <button ref={closeRef} type="button" className="btn-close" aria-label="Close case study" onClick={onClose} />
        </div>

        <div className="offcanvas-body">
          {error && <div className="alert alert-danger" role="alert">{error}</div>}

          <dl className="row small mb-3">
            <dt className="col-4 text-secondary fw-normal">Industry</dt><dd className="col-8 mb-1">{record ? record.industry ?? 'Not set' : '…'}</dd>
            <dt className="col-4 text-secondary fw-normal">Main capability</dt><dd className="col-8 mb-1">{record ? record.primaryCapability ?? 'Not set' : '…'}</dd>
          </dl>

          <h3 className="h6">Summary</h3>
          <p className="small mb-4" style={{ whiteSpace: 'pre-line' }}>
            {record ? record.canonicalSummary || <span className="text-secondary">No summary yet. {outside ? 'Read the original document below.' : 'Add one on the full record.'}</span> : 'Loading…'}
          </p>

          <h3 className="h6">Services it proves</h3>
          {links == null ? <p className="small text-secondary">Loading…</p> : visibleLinks.length === 0 ? (
            <p className="small text-secondary mb-4">Not linked to any service yet. Link it from its card in Intake.</p>
          ) : (
            <ul className="list-unstyled small mb-4" data-testid="drawer-links">
              {visibleLinks.map((l) => (
                <li key={l.id} className="d-flex align-items-center gap-2 mb-1">
                  <span className={`badge ${LINK_BADGE[l.state]}`}>{LINK_LABEL[l.state]}</span>{l.serviceName}
                </li>
              ))}
            </ul>
          )}

          {outside && (
            <>
              <h3 className="h6 d-flex justify-content-between align-items-center">
                Original document
                {doc && typeof doc === 'object' && (
                  <a className="btn btn-outline-secondary btn-sm" href={doc.url} download={`${(record?.title ?? seed.title).replace(/[\\/:*?"<>|]/g, '_')}.${ext}`}>
                    <i className="ri-download-2-line me-1" aria-hidden="true" />Download
                  </a>
                )}
              </h3>
              {doc == null && <p className="small text-secondary">Loading the document…</p>}
              {doc === 'none' && <p className="small text-secondary">No original document is on file for this case study.</p>}
              {doc === 'error' && <p className="small text-danger">The document could not be loaded. Try again, or open the full record.</p>}
              {pdf && typeof doc === 'object' && (
                <iframe title={`Original document: ${record?.title ?? seed.title}`} src={doc.url} className="w-100 border rounded" style={{ height: '70vh' }} />
              )}
              {doc && typeof doc === 'object' && !pdf && <p className="small text-secondary">This file type cannot be shown in the page. Use Download.</p>}
            </>
          )}
        </div>

        <div className="border-top p-3 d-flex justify-content-between">
          <a className="btn btn-outline-primary btn-sm" href={caseStudyHref(seed.id)} target="_blank" rel="noopener noreferrer">
            <i className="ri-external-link-line me-1" aria-hidden="true" />Open full record
          </a>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
        </div>
      </aside>
    </>
  );
}
