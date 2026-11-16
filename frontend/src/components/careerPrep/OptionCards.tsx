import React, { useRef } from 'react';

/**
 * Career Prep v27 (CP3.2): answers as option cards (Ali: "When asking questions, present options in
 * cards"). Each card: icon, bold title, one line, optional badge, optional readiness bar. Cards are
 * buttons in a role="list"; ArrowDown/ArrowUp (and Left/Right) move between them. A set that is no
 * longer the newest is `live={false}`: dimmed and not clickable.
 */
export interface OptionCard {
  id: string;
  icon: string;
  title: string;
  line: string;
  badge?: 'Recommended' | 'Now';
  bar?: { value: number; target?: number };
}

export function OptionCards({ cards, live, onPick, label }: { cards: OptionCard[]; live: boolean; onPick: (c: OptionCard) => void; label: string }): React.ReactElement {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (i: number, e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    refs.current[(i + step + cards.length) % cards.length]?.focus();
  };
  return (
    <div className={`cp-cards${live ? '' : ' is-quiet'}`} role="list" aria-label={label} data-testid="cp-cards">
      {cards.map((c, i) => (
        <div role="listitem" key={c.id}>
          <button
            type="button" ref={(el) => { refs.current[i] = el; }} className="cp-card" aria-disabled={!live}
            onClick={() => { if (live) onPick(c); }} onKeyDown={(e) => move(i, e)} data-testid={`cp-card-${c.id}`}
          >
            <i className={`ri-${c.icon}`} aria-hidden="true" />
            <span className="cp-card-body">
              <b>{c.title}</b>{c.badge && <span className="cp-badge">{c.badge}</span>}
              <span>{c.line}</span>
              {c.bar && (
                <span className="cp-bar" role="img" aria-label={`Readiness ${c.bar.value}${c.bar.target !== undefined ? `, ready at ${c.bar.target}` : ''}`}>
                  <span className="cp-bar-fill" style={{ width: `${Math.max(0, Math.min(100, c.bar.value))}%` }} />
                  {c.bar.target !== undefined && <span className="cp-bar-tick" style={{ left: `${c.bar.target}%` }} />}
                </span>
              )}
            </span>
          </button>
        </div>
      ))}
    </div>
  );
}
