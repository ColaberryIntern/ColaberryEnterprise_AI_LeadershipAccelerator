import React, { useEffect, useRef, useState } from 'react';
import { filterJump, JUMP_ITEMS, type JumpItem } from './logic/sheets';

/**
 * Career Prep v27 (CP4.6): "Jump to anything" (kit 4.7). Opens on "/" (when not typing in a field) or
 * Ctrl+K / Cmd+K, lists every sheet plus the room's common actions, filters as you type, Enter goes to the
 * highlighted one, the arrow keys move, Esc closes. A combobox over a listbox, so screen readers follow it.
 */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

function useJumpKeys(setOpen: (v: boolean) => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); return; }
      if (e.key === '/' && !typing(e.target)) { e.preventDefault(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [setOpen]);
}

export function JumpBar({ onGo }: { onGo: (item: JumpItem) => void }): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useJumpKeys(setOpen);
  useEffect(() => { if (open) { setQuery(''); setActive(0); input.current?.focus(); } }, [open]);
  if (!open) return null;
  const items = filterJump(JUMP_ITEMS, query);
  const go = (i: JumpItem | undefined) => { if (!i) return; setOpen(false); onGo(i); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); } else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, items.length - 1)); } else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
  };
  return (
    <div className="cp-jump" role="dialog" aria-label="Jump to anything" data-testid="cp-jump">
      <input ref={input} className="cp-input" role="combobox" aria-expanded="true" aria-controls="cp-jump-list" aria-activedescendant={items[active] ? `cp-jump-${items[active].id}` : undefined}
        placeholder="Jump to anything" value={query} onChange={(e) => { setQuery(e.target.value); setActive(0); }} onKeyDown={onKey} data-testid="cp-jump-input" />
      <ul id="cp-jump-list" role="listbox" className="cp-jump-list">
        {items.map((i, k) => (
          <li key={i.id} id={`cp-jump-${i.id}`} role="option" aria-selected={k === active} className={k === active ? 'active' : undefined} onMouseDown={(e) => { e.preventDefault(); go(i); }}>
            {i.label} <small className="cp-muted">{i.hint}</small>
          </li>
        ))}
        {items.length === 0 && <li className="cp-muted">Nothing matches.</li>}
      </ul>
    </div>
  );
}
