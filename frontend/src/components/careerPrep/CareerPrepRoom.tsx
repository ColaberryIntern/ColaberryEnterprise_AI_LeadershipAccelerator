import React, { useEffect, useRef, useState } from 'react';
import { AnchorPill } from './AnchorPill';
import type { PrepInterview } from './careerPrepApi';
import { careerPrepFloorNum } from './careerPrepFloorNum';
import { LevelTrail } from './LevelTrail';
import { layerOpen } from './useEscapeLayer';
import './careerPrepRoom.css';

/**
 * Career Prep v27 (CP3.1): the room, full screen over the Career Prep floor. Top bar: "‹ Floor n",
 * the level trail (hidden under 900px), the anchor pill, nothing else. Left: Cora. Right: three tabs,
 * Your progress (default), Your plan, Session. Back and Esc close it and return focus to whatever
 * opened it; Esc inside a text field (the ask box) does not. The room is Refactored.ai inside a
 * Colaberry campus, drawn LIGHT as in the design (shots L3-1..L3-7) whatever the OS theme: its palette is defined
 * on .cp-room in careerPrepRoom.css, not taken from the page theme.
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
  /** Controlled tab (the conversation can switch it, e.g. "show my progress"). */
  tab?: RoomTab;
  onTabChange?: (t: RoomTab) => void;
  /** CP4.6: layers drawn INSIDE the room (the open sheet, the jump bar), so they stack above it and share its theme. */
  overlay?: React.ReactNode;
}

const isTextField = (t: EventTarget | null) => t instanceof HTMLElement && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.isContentEditable);

export function CareerPrepRoom({ anchor, onChangeAnchor, onClose, cora, tabs, initialTab = 'progress', tab: controlled, onTabChange, overlay }: CareerPrepRoomProps): React.ReactElement {
  const [own, setOwn] = useState<RoomTab>(initialTab);
  const tab = controlled ?? own;
  const setTab = (t: RoomTab) => { setOwn(t); onTabChange?.(t); };
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const coraRef = useRef<HTMLElement>(null);
  const floorNum = careerPrepFloorNum();

  useEffect(() => {
    // A sheet opened by a direct link focuses its own title first (it renders inside the room); leave it there.
    if (!layerOpen()) coraRef.current?.focus();
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
    <div className="cp-room" role="dialog" aria-modal="true" aria-label="Career Prep" data-testid="cp-room">
      <header className="cp-room-top">
        <button type="button" className="cp-back" onClick={onClose} data-testid="cp-back">‹ {floorNum ? `Floor ${floorNum}` : 'Back'}</button>
        <LevelTrail step={3} floorNum={floorNum} />
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
      {overlay}
    </div>
  );
}
