import React, { useEffect, useId, useRef, useState } from 'react';
import type { EvidenceCaseStudy, SourceKind } from '../../../services/ourServicesApi';
import { CaseStudyTitleLink, SOURCE_PILL } from './CaseStudyCard';
import CaseStudyOpenButtons from './CaseStudyOpenButtons';

/**
 * CaseStudySourceMenu - the Inside / Drive count in the catalog's "Case studies" column, as a button. Clicking it
 * lists that service's confirmed case studies of that kind, each with its title (opens the side panel) and one button:
 * Manage (the case-study desk) for inside ones, or Open original (the imported file) for outside ones. A zero count stays a plain disabled chip.
 *
 * The list is position:fixed, measured from the chip on open, because the catalog sits in a horizontally scrolling
 * wrapper that would clip an absolutely positioned list. It closes on Escape (focus returns to the chip), on a click
 * outside it, and on page scroll (where a fixed list would drift away from its chip).
 */
export default function CaseStudySourceMenu({ kind, serviceName, caseStudies }: {
  kind: SourceKind; serviceName: string; caseStudies: EvidenceCaseStudy[];
}): React.ReactElement {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const panelId = useId();
  const wrapRef = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const items = caseStudies.filter((c) => c.sourceKind === kind);
  const pill = SOURCE_PILL[kind];
  const noun = kind === 'inside' ? 'inside' : 'outside';

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus(); } };
    const onDown = (e: MouseEvent): void => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const onScroll = (e: Event): void => { if (!(e.target instanceof Node && wrapRef.current?.contains(e.target))) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true); };
  }, [open]);

  const toggle = (): void => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const width = Math.min(420, window.innerWidth - 32);
      setPos({ top: r.bottom + 4, left: Math.max(16, Math.min(r.left, window.innerWidth - width - 16)) });
    }
    setOpen(!open);
  };

  return (
    <span className="d-inline-block" ref={wrapRef}>
      <button type="button" ref={btnRef} className={`badge rounded-pill border-0 ${pill.className}`} disabled={items.length === 0}
        aria-expanded={open} aria-controls={panelId} onClick={toggle}
        title={items.length ? `List the ${noun} case studies` : `No ${noun} case studies linked`} data-testid={`cs-menu-${kind}`}>
        <i className={`${pill.icon} me-1`} aria-hidden="true" />{items.length}
        <span className="visually-hidden"> {noun} case studies for {serviceName}{items.length ? ', show list' : ''}</span>
        {items.length > 0 && <i className={`ri-arrow-${open ? 'up' : 'down'}-s-line ms-1`} aria-hidden="true" />}
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={`${pill.label} case studies for ${serviceName}`}
          className="position-fixed bg-body border rounded-3 shadow p-2 text-start overflow-auto"
          style={{ zIndex: 1050, top: pos.top, left: pos.left, width: 420, maxWidth: 'calc(100vw - 32px)', maxHeight: '60vh', whiteSpace: 'normal' }}>
          <div className="small fw-bold text-secondary mb-1">{items.length} {noun} case {items.length === 1 ? 'study' : 'studies'} · confirmed</div>
          <ul className="list-unstyled mb-0">
            {items.map((cs) => (
              <li key={cs.id} className="py-1 border-top" data-testid={`cs-menu-item-${cs.id}`}>
                {/* The title opens the side panel; close the list so it does not sit over the panel. */}
                <div className="small fw-semibold lh-sm" onClickCapture={() => setOpen(false)}><CaseStudyTitleLink id={cs.id} title={cs.title} /></div>
                <div className="small text-secondary">{cs.industry ?? 'Industry not set'}{cs.year != null ? ` · ${cs.year}` : ''}</div>
                <CaseStudyOpenButtons id={cs.id} title={cs.title} sourceKind={cs.sourceKind} className="mt-1" />
              </li>
            ))}
          </ul>
        </div>
      )}
    </span>
  );
}
