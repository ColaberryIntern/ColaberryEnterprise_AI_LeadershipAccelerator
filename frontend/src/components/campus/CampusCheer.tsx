import React, { useEffect, useRef, useState } from 'react';
import { onCheer } from './campusCheerBus';
import type { Cheer } from './campusCheerBus';
import { onPointsEarned } from '../../services/pointsFx';
import './campusCheer.css';

/**
 * Shows the campus cheers one at a time (the prototype's #cheer, a polite live region) and, with `burst`, the "+n pts" that floats
 * up from the points pill whenever points are earned (the prototype's .pt-burst). The burst is for the campus home only: portal
 * pages already animate their own points HUD from the same signal.
 *
 * Reduce motion: the cheer still shows (it carries information), without its slide; the burst is skipped.
 */
const GAP_MS = 350;

export default function CampusCheer({ burst = false, reduceMotion = false }: { burst?: boolean; reduceMotion?: boolean }): React.ReactElement {
  const queue = useRef<Cheer[]>([]);
  const [now, setNow] = useState<Cheer | null>(null);
  const [bursts, setBursts] = useState<{ id: number; text: string; left: number; top: number }[]>([]);
  const busy = useRef(false);
  const seq = useRef(0);

  useEffect(() => {
    let timer: number | null = null;
    const next = () => {
      const c = queue.current.shift();
      if (!c) { busy.current = false; setNow(null); return; }
      busy.current = true;
      setNow(c);
      timer = window.setTimeout(() => { setNow(null); timer = window.setTimeout(next, GAP_MS); }, c.ms ?? 3600);
    };
    const off = onCheer((c) => { queue.current.push(c); if (!busy.current) next(); });
    return () => { off(); if (timer !== null) window.clearTimeout(timer); };
  }, []);

  useEffect(() => {
    if (!burst || reduceMotion) return undefined;
    return onPointsEarned(({ delta }) => {
      const pill = document.querySelector('[data-testid="cm-stats-points"]');
      const r = pill?.getBoundingClientRect();
      if (!r || !r.width) return;
      seq.current += 1;
      const b = { id: seq.current, text: `+${delta} pts`, left: r.left + r.width / 2, top: r.bottom + 4 };
      setBursts((xs) => [...xs, b]);
      window.setTimeout(() => setBursts((xs) => xs.filter((x) => x.id !== b.id)), 1700);
    });
  }, [burst, reduceMotion]);

  return (
    <>
      <div className={`cm-cheer${now ? ' is-on' : ''}${reduceMotion ? ' is-reduced' : ''}`} role="status" aria-live="polite" data-testid="cm-cheer">
        {now && (
          <>
            {now.big && <span className="cm-cheer-big" aria-hidden="true">{now.big}</span>}
            <div><b>{now.title}</b>{now.detail && <small>{now.detail}</small>}</div>
            {now.action && <button type="button" onClick={() => { now.action!.run(); setNow(null); }} data-testid="cm-cheer-action">{now.action.label}</button>}
          </>
        )}
      </div>
      {bursts.map((b) => <div key={b.id} className="cm-pt-burst" style={{ left: b.left, top: b.top }} aria-hidden="true" data-testid="cm-pt-burst">{b.text}</div>)}
    </>
  );
}
