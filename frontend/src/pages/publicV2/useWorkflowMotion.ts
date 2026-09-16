import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useWorkflowMotion - particles that travel the edges of a workflow graph.
 *
 * ILLUSTRATIVE, AND SAID SO. The spawn cadence and travel time are fixed
 * constants; nothing here reads an event rate, a recovery time or any figure
 * on the record. The motion shows which way the flow runs, and that is all
 * the band's own note claims for it.
 *
 * FOUR WAYS IT STAYS STILL, each a real condition rather than a preference:
 *   1. `prefers-reduced-motion: reduce`, read at mount and watched for change.
 *      No particles are ever created and the control reads "Reduced motion".
 *   2. The reader pressed Pause. State survives a panel switch.
 *   3. The graph is off screen (IntersectionObserver), or the tab is hidden
 *      (`document.hidden`): the frame loop stops, so a page with the band
 *      below the fold costs nothing until it is looked at.
 *   4. The record set `motion: 'off'`, or the browser has no
 *      `getPointAtLength` (jsdom, some print engines): no particles, and the
 *      static arrows carry the whole meaning.
 *
 * THE DOM, NOT REACT STATE, CARRIES EACH FRAME. Circles are created once per
 * run inside a `<g>` React leaves empty and moved by setting `cx`/`cy`, so a
 * frame never re-renders the graph. Cleanup empties the layer and cancels the
 * frame, so a route change mid-run cannot leave a loop writing into a detached
 * SVG.
 */

export type WorkflowMotionState = 'running' | 'paused' | 'reduced' | 'off';

export interface WorkflowMotion {
  /** The SVG the particles belong to. */
  readonly svgRef: React.RefObject<SVGSVGElement>;
  /** The empty `<g>` the particles are drawn into. */
  readonly layerRef: React.RefObject<SVGGElement>;
  readonly state: WorkflowMotionState;
  readonly togglePause: () => void;
}

/** Fixed, documented as illustrative in the band's motion note. */
const SPAWN_MS = 1500;
const TRAVEL_MS = 1900;
const PATH_SELECTOR = 'path[data-motion="true"]';
const PARTICLE_CLASS = 'cbv2-story-visual__particle';
const SVG_NS = 'http://www.w3.org/2000/svg';

interface MotionPath { readonly el: SVGPathElement; readonly length: number; readonly offset: number; readonly status: string }
interface Particle { readonly el: SVGCircleElement; readonly path: MotionPath; readonly born: number }

const reducedNow = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useWorkflowMotion(enabled: boolean, panelKey: string): WorkflowMotion {
  const svgRef = useRef<SVGSVGElement>(null);
  const layerRef = useRef<SVGGElement>(null);
  const [reduced, setReduced] = useState<boolean>(reducedNow);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [hidden, setHidden] = useState<boolean>(() => typeof document !== 'undefined' && document.hidden);

  // 1. Reduced motion, at mount and on change.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (): void => setReduced(query.matches);
    onChange();
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    return undefined;
  }, []);

  // 3a. Visibility of the graph itself.
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof IntersectionObserver !== 'function') { setVisible(Boolean(el)); return undefined; }
    const io = new IntersectionObserver((entries) => {
      setVisible(entries.some((e) => e.isIntersecting));
    }, { threshold: 0.1 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // 3b. Visibility of the tab.
  useEffect(() => {
    const onChange = (): void => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  const state: WorkflowMotionState = !enabled ? 'off' : reduced ? 'reduced' : paused ? 'paused' : 'running';
  const run = state === 'running' && visible && !hidden;

  // The frame loop. Re-runs when the panel changes, because the paths change.
  useEffect(() => {
    const svg = svgRef.current;
    const layer = layerRef.current;
    if (!run || !svg || !layer) return undefined;
    const raw = Array.from(svg.querySelectorAll<SVGPathElement>(PATH_SELECTOR));
    // 4. No measurement API, no particles. The arrows are still there.
    if (raw.length === 0 || typeof raw[0].getTotalLength !== 'function' || typeof raw[0].getPointAtLength !== 'function') return undefined;
    const paths: MotionPath[] = raw.map((el, i) => ({
      el, length: el.getTotalLength(), offset: (i * 230) % SPAWN_MS, status: el.getAttribute('data-status') || 'processing',
    }));
    const particles: Particle[] = [];
    const lastSpawn = new Map<MotionPath, number>();
    let frame = 0;
    const start = performance.now();

    const tick = (now: number): void => {
      const elapsed = now - start;
      for (const path of paths) {
        const last = lastSpawn.get(path) ?? -Infinity;
        if (elapsed >= path.offset && now - last >= SPAWN_MS) {
          const el = document.createElementNS(SVG_NS, 'circle');
          el.setAttribute('class', `${PARTICLE_CLASS} ${PARTICLE_CLASS}--${path.status}`);
          el.setAttribute('r', '4');
          layer.appendChild(el);
          particles.push({ el, path, born: now });
          lastSpawn.set(path, now);
        }
      }
      for (let i = particles.length - 1; i >= 0; i -= 1) {
        const p = particles[i];
        const t = (now - p.born) / TRAVEL_MS;
        if (t >= 1) {
          p.el.remove();
          particles.splice(i, 1);
        } else {
          const point = p.path.el.getPointAtLength(p.path.length * t);
          p.el.setAttribute('cx', String(point.x));
          p.el.setAttribute('cy', String(point.y));
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      for (const p of particles) p.el.remove();
      while (layer.firstChild) layer.removeChild(layer.firstChild);
    };
  }, [run, panelKey]);

  const togglePause = useCallback(() => setPaused((p) => !p), []);

  return { svgRef, layerRef, state, togglePause };
}

export default useWorkflowMotion;
