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

    // Backstop: if the observer never fires (element already past, tab
    // restored, layout quirk) the figure must still end up correct rather than
    // sitting at zero.
    const timer = window.setTimeout(() => {
      if (!started) {
        io.disconnect();
        finish();
      }
    }, 2500);

    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      if (frame) cancelAnimationFrame(frame);
    };
    // `text` is the claim wording; re-running on change is correct.
  }, [text, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ref, display, settled };
}
