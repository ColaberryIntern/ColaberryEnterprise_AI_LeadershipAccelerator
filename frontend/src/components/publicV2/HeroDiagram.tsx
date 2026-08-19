import React, { useEffect, useRef, useState } from 'react';
import { ReactComponent as StaffedSystem } from './heroSystemDiagram.svg';

/**
 * The hero diagram: Ali's staffed-system drawing, animated.
 *
 * It is imported as a COMPONENT rather than an <img> so the animation can drive
 * the actual elements. An <img> would only ever let us fade the whole picture,
 * and the thing worth animating here is the structure: the pipeline across the
 * top, the people along the bottom, and the connectors between them.
 *
 * WHAT THE MOTION SAYS. The system row builds first, then the connectors run,
 * then the people row arrives -- which is the page's argument in the order the
 * headline states it. It is one pass on entry, not a loop: a hero that keeps
 * moving competes with the copy beside it forever, and this only needs to make
 * its point once.
 *
 * The whole figure is aria-hidden. Every label in it -- system, people, one
 * platform -- restates a word already in the headline and body text to its
 * left, so announcing it would read the same claim twice.
 */

export default function HeroDiagram(): React.ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const reduced =
      typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Reduced motion gets the finished drawing immediately: the completed state
    // is the one that carries the meaning, so there is nothing to withhold.
    if (reduced || typeof IntersectionObserver !== 'function') {
      setShown(true);
      return undefined;
    }

    const el = hostRef.current;
    if (!el) { setShown(true); return undefined; }

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { setShown(true); io.disconnect(); }
      }),
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={hostRef}
      className={`cbv2-h7dia${shown ? ' is-in' : ''}`}
      aria-hidden="true"
    >
      <StaffedSystem />
    </div>
  );
}
