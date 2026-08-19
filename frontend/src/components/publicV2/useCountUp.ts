import { useEffect, useRef, useState } from 'react';

/**
 * Count-up animation for a claim figure.
 *
 * THREE RULES THIS HOOK EXISTS TO KEEP, all of which come from the fact that the
 * thing being animated is a governed claim and not decoration:
 *
 * 1. THE FINAL TEXT IS THE REGISTRY WORDING, EXACTLY. The hook animates only the
 *    leading numeric run and reassembles the original string around it, so
 *    "8k+ data students" ends as "8k+ data students" -- never a reformatted or
 *    re-pluralised version of itself. If no leading number is found, the string
 *    is returned untouched and nothing animates.
 *
 * 2. ASSISTIVE TECH NEVER HEARS AN INTERMEDIATE VALUE. A screen reader
 *    announcing "437 hires" on the way to 1,000 would be reading a false claim
 *    aloud. Callers must render the animated digits with aria-hidden and expose
 *    the true wording separately -- see Accolades.tsx, which does exactly that.
 *
 * 3. REDUCED MOTION GETS THE FINAL VALUE IMMEDIATELY, not a faster animation.
 *
 * It also only runs once, when the element first scrolls into view, and cleans
 * up its observer and frame on unmount so a route change mid-count cannot leave
 * a callback writing into an unmounted component.
 */

/** Splits "2,500+ certified" into 2500, "" and "+ certified". */
function parseFigure(text: string): { value: number; prefix: string; suffix: string } | null {
  const match = text.match(/^(\D*?)([\d][\d,\s]*)(.*)$/s);
  if (!match) return null;
  const digits = match[2].replace(/[,\s]/g, '');
  const value = Number(digits);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, prefix: match[1], suffix: match[3] };
}

/** Re-inserts thousands separators so 1000 reads back as "1,000". */
function group(n: number, original: string): string {
  return original.includes(',') ? n.toLocaleString('en-US') : String(n);
}

export interface CountUp {
  /** Attach to the element that should trigger on scroll. */
  ref: React.RefObject<HTMLElement>;
  /** The string to display. Equals the input exactly once finished. */
  display: string;
  /** True when the value shown is the real one, so callers can drop aria-hidden. */
  settled: boolean;
}

export default function useCountUp(text: string, durationMs = 1100): CountUp {
  const ref = useRef<HTMLElement>(null);
  const parsed = parseFigure(text);
  // With nothing numeric to animate, settle immediately -- the caller then
  // renders plain text and never marks anything aria-hidden.
  const [display, setDisplay] = useState<string>(parsed ? `${parsed.prefix}0${parsed.suffix}` : text);
  const [settled, setSettled] = useState<boolean>(!parsed);

  useEffect(() => {
    if (!parsed) {
      setDisplay(text);
      setSettled(true);
      return undefined;
    }

    const finish = (): void => {
      setDisplay(text);
      setSettled(true);
    };

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || typeof IntersectionObserver !== 'function') {
      finish();
      return undefined;
    }

    const el = ref.current;
    if (!el) {
      finish();
      return undefined;
    }

    let frame = 0;
    let started = false;

    const run = (): void => {
      const startedAt = performance.now();
      const tick = (now: number): void => {
        const t = Math.min(1, (now - startedAt) / durationMs);
        // easeOutCubic: fast first, settling gently, so the number reads as
        // arriving at a value rather than ticking mechanically.
        const eased = 1 - (1 - t) ** 3;
        if (t >= 1) {
          finish();
          return;
        }
        const current = Math.round(parsed.value * eased);
        setDisplay(`${parsed.prefix}${group(current, text)}${parsed.suffix}`);
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !started) {
            started = true;
            io.disconnect();
            run();
          }
        });
      },
      { threshold: 0.4 },
    );
    io.observe(el);

    /*
     * Backstop, and the reason it re-checks instead of just firing.
     *
     * THE DEFECT THIS FIXES. The first version finished the count 2.5s after
     * MOUNT, unconditionally. These figures sit ~3,200px below the fold, so the
     * timer always won the race against a human scrolling down: by the time the
     * band came into view the numbers had long since settled, and the animation
     * effectively never existed. A backstop that cannot tell "the observer is
     * broken" from "the reader has not got here yet" will always resolve that
     * ambiguity the wrong way.
     *
     * So it now only rescues a figure that is ACTUALLY ON SCREEN and still at
     * zero. If the element is off screen it re-arms and waits, which keeps the
     * original guarantee -- a visible figure never sits at zero -- without
     * spending the animation before anyone can see it.
     */
    let timer = 0;
    const armBackstop = (): void => {
      timer = window.setTimeout(() => {
        if (started) return;
        const r = el.getBoundingClientRect();
        const onScreen = r.top < window.innerHeight && r.bottom > 0;
        if (onScreen) {
          started = true;
          io.disconnect();
          finish();
          return;
        }
        armBackstop();
      }, 2500);
    };
    armBackstop();

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
    // `text` is the claim wording; re-running on change is correct.
    //
    // No eslint-disable here: this is a .ts file, where CRA does not register
    // the react-hooks rules, so a disable comment naming
    // `react-hooks/exhaustive-deps` is itself the error — "Definition for rule
    // ... was not found" — and `CI=true` promotes it to a failed build. The
    // rule cannot fire on this file, so there is nothing to suppress.
  }, [text, durationMs]);

  return { ref, display, settled };
}
