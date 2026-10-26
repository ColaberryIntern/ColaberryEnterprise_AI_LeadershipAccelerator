import React, { useEffect, useRef, useState } from 'react';
import { CRAVINGS, DEFAULT_CRAVING, appsFor, foodLead, foodRegion, mealAt, urlFor, type Region } from './deliveryApps';
import type { Condition } from '../weather/weatherModel';
import { useCampusWeather } from '../weather/useCampusWeather';
import '../admissions/campusBook.css';
import './chow.css';

/**
 * The order sheet (Campus v11 C3, Basecamp C39): "Grab something good", the lead line (meal time + the window's weather), one craving
 * at a time (the default from the meal time), one card per delivery app for your region (names in text, no logos) with "Search
 * ‹craving› ↗" or "Open ↗", Show all apps, and "Colaberry doesn't take orders or payments." Every link is a plain anchor opening the
 * app's own site in a new tab (rel noopener noreferrer). Opened from any entry point with openOrderSheet(craving?); ✕ or Esc closes.
 */
export const ORDER_EVENT = 'cm-open-order';
export function openOrderSheet(craving?: string): void { try { window.dispatchEvent(new CustomEvent<string | undefined>(ORDER_EVENT, { detail: craving })); } catch { /* non-DOM */ } }

const zone = (): string => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Chicago'; } catch { return 'America/Chicago'; } };
const REGION_NOTE: Record<Region, string> = { US: 'Available in the US', GB: 'Available in the UK', IN: 'Available in India', ANY: 'Available in many countries' };

export function OrderSheet({ craving: initial, condition = null, onClose, now = new Date(), tz = zone() }: { craving?: string; condition?: Condition | null; onClose: () => void; now?: Date; tz?: string }): React.ReactElement {
  const [craving, setCraving] = useState(initial ?? DEFAULT_CRAVING[mealAt(now)]);
  const [all, setAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const region = foodRegion(tz);
  const label = CRAVINGS.find((c) => c.id === craving)?.label ?? craving;
  useEffect(() => {
    // Capture phase: the map (CampusWorld) handles Escape on its own subtree and stops it, so a bubbling listener never heard it
    // when the sheet was opened from the room's counter (e2e C39). The sheet consumes Escape so the room's card stays open.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  useEffect(() => { closeRef.current?.focus(); }, []); // a dialog takes focus when it opens (once: the host re-renders on the weather tick)
  return (
    <div className="cm-book-scrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cm-book" role="dialog" aria-modal="true" aria-labelledby="cm-order-h" data-testid="cm-order">
        <header>
          <small>CHOW HALL</small>
          <h2 id="cm-order-h">Grab something good</h2>
          <p>{foodLead(now, condition)}</p>
          <button type="button" className="cm-book-x" ref={closeRef} onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="cm-book-body">
          <fieldset><legend>What are you craving?</legend><div className="cm-book-chips">
            {CRAVINGS.map((c) => <button key={c.id} type="button" className={`cm-book-chip${craving === c.id ? ' on' : ''}`} aria-pressed={craving === c.id} onClick={() => setCraving(c.id)} data-testid={`cm-crave-${c.id}`}>{c.emoji} {c.label}</button>)}
          </div></fieldset>
          <div className="cm-order-apps" data-testid="cm-order-apps">
            {appsFor(region, all).map((a) => (
              <a key={a.name} className="cm-order-app" href={urlFor(a, label)} target="_blank" rel="noopener noreferrer" data-testid={`cm-app-${a.name.replace(/\s+/g, '-').toLowerCase()}`}>
                <b>{a.name}</b><span>{a.search ? `Search ${label.toLowerCase()} ↗` : 'Open ↗'}</span><small>{REGION_NOTE[a.regions[0]]}</small>
              </a>
            ))}
          </div>
          <label className="cm-wx-toggle"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} data-testid="cm-order-all" /> Show all apps</label>
          <p className="cm-book-hint">Colaberry doesn&rsquo;t take orders or payments. Each link opens the app&rsquo;s own site in a new tab.</p>
        </div>
      </div>
    </div>
  );
}

/**
 * The one host (the room's screen, chalkboard, counter and door, the chips and Where-to all open it), mounted on the home and with the
 * campus layers; only the first mounted host listens, so a page with both never opens two sheets. The lead line reads the same shared
 * weather reading as the room's window (no second call).
 */
let owner: symbol | null = null;
export default function OrderSheetHost(): React.ReactElement | null {
  const [open, setOpen] = useState<{ craving?: string } | null>(null);
  const wx = useCampusWeather(open !== null);
  useEffect(() => {
    if (owner) return undefined;
    const me = Symbol('order-host');
    owner = me;
    const h = (e: Event) => setOpen({ craving: (e as CustomEvent<string | undefined>).detail ?? undefined });
    window.addEventListener(ORDER_EVENT, h);
    return () => { window.removeEventListener(ORDER_EVENT, h); if (owner === me) owner = null; };
  }, []);
  return open ? <OrderSheet craving={open.craving} condition={wx.w.condition} onClose={() => setOpen(null)} /> : null;
}
