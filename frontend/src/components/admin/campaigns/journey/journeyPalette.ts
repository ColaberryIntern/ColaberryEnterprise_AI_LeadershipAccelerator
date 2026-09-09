/**
 * Colour for the Outreach Journey Flow.
 *
 * PALETTE PROVENANCE. These are the same hues the Visitors traffic Sankey uses,
 * and they are reused deliberately rather than re-picked. That palette was already
 * validated in this product for lightness, chroma and colourblind separation, and
 * the design system's own default order was rejected there for concrete reasons:
 * its green and amber sit at ΔE 1.8 under protanopia, and its brand blue falls
 * under the chroma floor and reads grey.
 *
 * WHY RESPONSE IS TEAL AND NOT BLUE. The brief asks for a blue Response column.
 * This product has no blue that survives the chroma floor, which is exactly why the
 * Visitors chart substituted teal. Two Sankey diagrams in one admin disagreeing
 * about what a stage colour means is a worse outcome than one of them not being
 * blue, so the substitution is carried over rather than re-litigated per chart.
 *
 * COLOUR IS NOT THE ONLY CHANNEL. Every node is directly labelled, every stage has
 * a heading, and the full path table ships beside the diagram — which is the relief
 * for the palette steps that sit under 3:1 against the surface.
 */

import { useEffect, useState } from 'react';
import type { JourneyStage } from './campaignSankeyAdapter';

type Ramp = Record<JourneyStage, string>;

const LIGHT: Ramp = {
  source: '#7A5AF0',
  outreach: '#FB2832',
  response: '#2BA39A',
  journey: '#E8920C',
  outcome: '#5BA63C',
  other: '#6B6B6B',
};

const DARK: Ramp = {
  source: '#9B83F5',
  outreach: '#FF6B72',
  response: '#44C0B6',
  journey: '#F0A93A',
  outcome: '#8AC759',
  other: '#B4B4B4',
};

/** Terminal, non-converting nodes. Muted so a dead end never looks like a result. */
const DEAD_END_LIGHT = '#8C8C8C';
const DEAD_END_DARK = '#7C7C7C';

export function stageColor(stage: JourneyStage, isDark: boolean): string {
  return (isDark ? DARK : LIGHT)[stage] ?? (isDark ? DARK.other : LIGHT.other);
}

export function deadEndColor(isDark: boolean): string {
  return isDark ? DEAD_END_DARK : DEAD_END_LIGHT;
}

/**
 * Theme, read from the same `data-theme` attribute the rest of the admin uses and
 * watched rather than sampled once — the theme toggle does not remount this tree,
 * so a one-shot read would leave the chart in the previous theme's colours.
 */
export function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark',
  );
  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const el = document.documentElement;
    const read = () => setDark(el.getAttribute('data-theme') === 'dark');
    const observer = new MutationObserver(read);
    observer.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    read();
    return () => observer.disconnect();
  }, []);
  return dark;
}

/**
 * Respect the OS reduced-motion setting.
 *
 * The chart must be readable with every transition switched off, so this gates
 * decoration only. No information on this screen is carried by movement.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const read = () => setReduced(mq.matches);
    read();
    // Safari < 14 only has the deprecated listener API.
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', read);
      return () => mq.removeEventListener('change', read);
    }
    mq.addListener(read);
    return () => mq.removeListener(read);
  }, []);
  return reduced;
}
