import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { art } from '../art/artColor';
import { trapTab } from '../focusTrap';
import { registerWayfinder } from '../wayfinderHost';
import { wayfinderSearch, wfIcon } from '../wayfinderIndex';
import type { WfContext, WfItem } from '../wayfinderIndex';
import { wd } from './conciergeCopy';
import '../campusWayfinder.css';

/**
 * The Wayfinder (WP-4; the prototype's #wf, D:1319-1328 and D:1897-1945): a centred palette over the blurred campus, opened by the
 * top bar's "Where are you headed?" pill, "/" or Ctrl/Cmd+K (never while you are typing somewhere else), or "Go somewhere else".
 *  - a combobox over a listbox: ArrowUp / ArrowDown move, Enter picks, Esc or a press on the backdrop closes; focus goes back to
 *    where it was;
 *  - groups (Happening now, Suggested for you, Staff · always on, All buildings / People, Buildings, Rooms), each row with its
 *    building's icon tile and what a pick does (Walk →, Run →, View, 🔒 Peek); a visible line when nothing matches;
 *  - a pick walks there (a room flashes in its building's card, the prototype's flashRoom), runs to what is starting, or opens a
 *    person's card. Nothing is logged: search insights are decision Q11's separate project.
 */
export default function Wayfinder({ ctx, onPick, onClosed }: {
  ctx: WfContext; onPick: (it: WfItem) => void;
  /** C23 (rule R10): closed without a pick (Esc, the backdrop); the home recenters its map. A pick walks instead. */
  onClosed?: () => void;
}): React.ReactElement | null {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const back = useRef<HTMLElement | null>(null);
  const listId = useId();
  const results = useMemo(() => (open ? wayfinderSearch(q, ctx) : []), [open, q, ctx]);

  const show = useCallback(() => {
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQ(''); setSel(0); setOpen(true);
  }, []);
  const closedRef = useRef(onClosed);
  closedRef.current = onClosed;
  const close = useCallback(() => { setOpen(false); closedRef.current?.(); window.setTimeout(() => back.current?.focus?.(), 0); }, []);
  useEffect(() => registerWayfinder(show), [show]);
  useEffect(() => { if (open) window.setTimeout(() => input.current?.focus(), 20); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open) return;
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const k = e.key.toLowerCase();
      if ((k === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey)) { e.preventDefault(); show(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, show]);
  useEffect(() => { document.getElementById(`${listId}-${sel}`)?.scrollIntoView?.({ block: 'nearest' }); }, [sel, listId]);

  if (!open) return null;
  const pick = (it: WfItem) => { setOpen(false); onPick(it); };
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(results.length - 1, s + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[sel]) pick(results[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  };
  const w = (s: string) => wd(s, ctx.workplace);
  return (
    <div className="cm-wf" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }} data-testid="cm-wayfinder">
      <div className="cm-wf-box" role="dialog" aria-modal="true" aria-label="Where are you headed?" onKeyDown={trapTab} tabIndex={-1}>
        <div className="cm-wf-in">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setSel(0); }} onKeyDown={onKeyDown}
            placeholder="Try “standup”, “cert prep”, “my points”, “class”…" aria-label="Search buildings, rooms and people"
            role="combobox" aria-expanded={results.length > 0} aria-controls={listId} aria-autocomplete="list"
            aria-activedescendant={results[sel] ? `${listId}-${sel}` : undefined} data-testid="cm-wf-input" />
        </div>
        <div className="cm-wf-res" role="listbox" id={listId} aria-label="Places and people">
          {groupsOf(results).map((g) => (
            <div key={g.name + g.start} role="group" aria-label={w(g.name)}>
              <div className="cm-wf-grp" aria-hidden="true">{w(g.name)}</div>
              {g.items.map((it, j) => {
                const i = g.start + j;
                return (
                  <div key={it.key} id={`${listId}-${i}`} role="option" aria-selected={i === sel} className={`cm-wf-item${i === sel ? ' is-sel' : ''}`} data-kind={it.kind}
                    onMouseMove={() => setSel(i)} onMouseDown={(e) => { e.preventDefault(); pick(it); }} data-testid="cm-wf-item">
                    <WfTile it={it} />
                    <div><b>{w(it.title)}</b><span>{w(it.sub)}</span></div>
                    <em>{it.action}</em>
                  </div>
                );
              })}
            </div>
          ))}
          {q.trim() && results.length === 0 && (
            <div className="cm-wf-none" role="status" data-testid="cm-wf-none">No building for “{q.trim()}”. Try “class”, “projects”, “points” or “standup”.</div>
          )}
        </div>
        <div className="cm-wf-hint" aria-hidden="true"><span>↑↓ to choose</span><span>Enter to walk there</span><span>Esc to close</span></div>
      </div>
    </div>
  );
}

/** Consecutive results of one group, with the index of the first (the listbox's options keep one running index). */
function groupsOf(results: WfItem[]): { name: string; start: number; items: WfItem[] }[] {
  const out: { name: string; start: number; items: WfItem[] }[] = [];
  results.forEach((it, i) => {
    const last = out[out.length - 1];
    if (last && last.name === it.group) last.items.push(it); else out.push({ name: it.group, start: i, items: [it] });
  });
  return out;
}

function WfTile({ it }: { it: WfItem }): React.ReactElement {
  if ((it.kind === 'person' || it.kind === 'staff') && it.person?.avatar_url) return <img className="ic" src={it.person.avatar_url} alt="" />;
  if (it.kind === 'person' || it.kind === 'staff') {
    const ini = it.title.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase();
    return <span className={`ic is-${it.kind}`} aria-hidden="true">{ini}</span>;
  }
  return <span className={`ic${it.kind === 'urgent' ? ' is-urgent' : ''}`} style={it.kind === 'urgent' ? undefined : { background: art(it.buildingId) }} aria-hidden="true">{wfIcon(it)}</span>;
}
