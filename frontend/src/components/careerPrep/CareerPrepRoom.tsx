import React, { useEffect, useRef, useState } from 'react';
import { themeForBrand, themeStyle } from '../../theme/deliveryBrandThemes';
import { AnchorPill } from './AnchorPill';
import type { PrepInterview } from './careerPrepApi';
import { careerPrepFloorNum } from './careerPrepFloorNum';
import './careerPrepRoom.css';

/**
 * Career Prep v27 (CP3.1): the room, full screen over the Career Prep floor. Top bar: "‹ Floor n",
 * the level trail (hidden under 900px), the anchor pill, nothing else. Left: Cora. Right: three tabs,
 * Your progress (default), Your plan, Session. Back and Esc close it and return focus to whatever
 * opened it; Esc inside a text field (the ask box) does not. The room is Refactored.ai inside a
 * Colaberry campus.
 */
export type RoomTab = 'progress' | 'plan' | 'session';
const TABS: ReadonlyArray<{ key: RoomTab; label: string }> = [
  { key: 'progress', label: 'Your progress' }, { key: 'plan', label: 'Your plan' }, { key: 'session', label: 'Session' },
];

export interface CareerPrepRoomProps {
  anchor: PrepInterview | null | undefined;
  onChangeAnchor: () => void;
  onClose: () => void;
  cora: React.ReactNode;
  tabs: Record<RoomTab, React.ReactNode>;
  initialTab?: RoomTab;
}

const isTextField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.isContentEditable);

export function CareerPrepRoom({ anchor, onChangeAnchor, onClose, cora, tabs, initialTab = 'progress' }: CareerPrepRoomProps): React.ReactElement {
  const [tab, setTab] = useState<RoomTab>(initialTab);
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const coraRef = useRef<HTMLElement>(null);
  const floorNum = careerPrepFloorNum();

  useEffect(() => {
    coraRef.current?.focus();
    const back = opener.current;
    return () => { if (back instanceof HTMLElement && document.contains(back)) back.focus(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTextField(e.target)) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="cp-room" role="dialog" aria-modal="true" aria-label="Career Prep" style={themeStyle(themeForBrand('refactored'))} data-testid="cp-room">
      <header className="cp-room-top">
        <button type="button" className="cp-back" onClick={onClose} data-testid="cp-back">‹ {floorNum ? `Floor ${floorNum}` : 'Back'}</button>
        <ol className="cp-trail" aria-label="Where you are" data-testid="cp-trail">
          <li>1 Tower</li><li>2 Floor {floorNum ?? ''}</li><li aria-current="step">3 Career Prep</li>
        </ol>
        <AnchorPill anchor={anchor} onChange={onChangeAnchor} />
      </header>
      <div className="cp-room-body">
        <section className="cp-cora-col" aria-label="Cora, your interview coach" tabIndex={-1} ref={coraRef} data-testid="cp-cora-col">{cora}</section>
        <section className="cp-tabs-col">
          <div className="cp-tabs" role="tablist" aria-label="Career Prep">
            {TABS.map((t) => (
              <button key={t.key} type="button" role="tab" id={`cp-tab-${t.key}`} aria-selected={tab === t.key} aria-controls={`cp-panel-${t.key}`}
                tabIndex={tab === t.key ? 0 : -1} className={`cp-tab${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)}>{t.label}</button>
            ))}
          </div>
          <div className="cp-panel" role="tabpanel" id={`cp-panel-${tab}`} aria-labelledby={`cp-tab-${tab}`} data-testid={`cp-panel-${tab}`}>{tabs[tab]}</div>
        </section>
      </div>
    </div>
  );
}
