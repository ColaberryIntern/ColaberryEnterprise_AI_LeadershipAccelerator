import React, { useEffect, useRef } from 'react';
import type { Sheet } from './logic/askRouter';
import { SHEETS, sheetInfo } from './logic/sheets';

/**
 * Career Prep v27 (CP4.6): one "getting hired" page as a sheet inside the room (kit 4.7): right side, over the
 * tabs, with "‹ Back to Career Prep", the sibling pages as quiet tabs, then the page's title and its one-line
 * purpose. Focus moves to the title on open; Esc, the scrim and Back all close it.
 */
export function PageSheet({ sheet, onClose, onSwitch, children }: { sheet: Sheet; onClose: () => void; onSwitch: (s: Sheet) => void; children: React.ReactNode }): React.ReactElement {
  const title = useRef<HTMLHeadingElement>(null);
  const info = sheetInfo(sheet);
  useEffect(() => { title.current?.focus(); }, [sheet]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="cp-sheet-layer">
      <button type="button" className="cp-sheet-scrim" aria-label="Close this page" tabIndex={-1} onClick={onClose} />
      <section className="cp-sheet" role="dialog" aria-modal="true" aria-labelledby="cp-sheet-title" data-testid={`cp-sheet-${sheet}`}>
        <button type="button" className="cp-linkbtn cp-sheet-back" onClick={onClose} data-testid="cp-sheet-back">‹ Back to Career Prep</button>
        <nav className="cp-sheet-tabs" aria-label="Getting hired">
          {SHEETS.map((s) => (
            <button key={s.key} type="button" className={`cp-sheet-tab${s.key === sheet ? ' active' : ''}`} aria-current={s.key === sheet ? 'page' : undefined} onClick={() => onSwitch(s.key)}>{s.title}</button>
          ))}
        </nav>
        <h2 id="cp-sheet-title" ref={title} tabIndex={-1}>{info.title}</h2>
        <p className="cp-muted">{info.purpose}</p>
        {children}
      </section>
    </div>
  );
}
