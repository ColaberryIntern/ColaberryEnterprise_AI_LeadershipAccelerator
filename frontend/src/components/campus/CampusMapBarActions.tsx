import React, { useEffect, useId, useRef, useState } from 'react';
import CampusSettingsPanel from './CampusSettingsPanel';

/**
 * The map bar's secondary actions (C11): Take the tour, My look, List view and Settings.
 *
 * At 390 px these plus the title and Close overflowed the bar. Under 820 px they collapse behind a "More" button (campus.css):
 * ONE set of buttons, shown inline on wide screens and as a dropdown on phones, so nothing is rendered twice. "More" is a
 * disclosure (aria-expanded); Esc closes it and returns focus to it without closing the map; choosing an action closes it.
 */
export interface MapBarActionsProps {
  showTour: boolean;
  showLook: boolean;
  onTour: () => void;
  onLook: () => void;
  onList: () => void;
}

export default function CampusMapBarActions({ showTour, showLook, onTour, onLook, onList }: MapBarActionsProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const more = useRef<HTMLButtonElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const id = `cm-more-${useId()}`;

  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>('button')?.focus(); }, [open]);

  const close = () => { setOpen(false); more.current?.focus(); };
  const pick = (fn: () => void) => () => { setOpen(false); fn(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation();
    close();
  };

  return (
    <div className={`cm-bar-actions${open ? ' is-open' : ''}`} onKeyDown={onKeyDown}>
      <button type="button" ref={more} className="cm-link cm-bar-more" aria-expanded={open} aria-controls={id}
        onClick={() => (open ? close() : setOpen(true))} data-testid="cm-bar-more">More</button>
      <div className="cm-bar-items" id={id} ref={list} data-testid="cm-bar-items">
        {showTour && <button type="button" className="cm-link" onClick={pick(onTour)} data-testid="cm-tour-start-bar">Take the tour</button>}
        {showLook && <button type="button" className="cm-link" onClick={pick(onLook)} data-testid="cm-look-open-bar">My look</button>}
        <button type="button" className="cm-link" onClick={pick(onList)}>List view</button>
        <CampusSettingsPanel variant="bar" />
      </div>
    </div>
  );
}
