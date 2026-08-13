import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * useReveal -- scroll-triggered reveals that cannot strand content.
 *
 * THIS MECHANISM HAS NOW FAILED TWICE. Both failures are recorded here because
 * the fix only makes sense against them:
 *
 *   1. In the prototype, CSS defaulted `.rv` to opacity 0 and relied on an
 *      observer to reveal it. Anything the observer never saw stayed invisible,
 *      and full-page screenshots came back blank below the fold.
 *
 *   2. In React, this hook ran in the LAYOUT with an empty dependency array. The
 *      layout does not remount on client-side navigation, so after clicking a
 *      nav link the incoming page's sections were never observed -- while
 *      `html.cbv2-reveal-on` was still set from the first page. Every section
 *      below the hero was permanently invisible. Verified by loading each URL
 *      directly, which remounts everything, so the bug was invisible to the
 *      check that was supposed to catch it.
 *
 * Three defences, all deliberate:
 *   a. CSS defaults to VISIBLE. The hidden state applies only under
 *      `html.cbv2-reveal-on`, added here, so no JS means no hiding.
 *   b. The effect re-runs on every pathname change, so each page's sections are
 *      queried and observed after they mount.
 *   c. Cleanup reveals everything and removes the opt-in class before the next
 *      run, so a half-finished transition can never persist across a navigation.
 *      Erring toward a visible flash rather than invisible content.
 */
export default function useReveal(): void {
  const { pathname } = useLocation();

  useEffect(() => {
    const root = document.documentElement;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Never opt in when motion is unwanted or the API is missing: content renders.
    if (reduced || typeof IntersectionObserver !== 'function') return undefined;

    const targets = Array.from(document.querySelectorAll('.cbv2-rv'));
    if (!targets.length) {
      // No targets on this route. Make sure a previous route's opt-in does not
      // linger, or the next page to mount would be hidden before its own run.
      root.classList.remove('cbv2-reveal-on');
      return undefined;
    }

    root.classList.add('cbv2-reveal-on');

    const revealAll = () => targets.forEach((el) => el.classList.add('is-in'));

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    );
    targets.forEach((el) => io.observe(el));

    // Safety net, per route: whatever happens, nothing stays hidden.
    const timer = window.setTimeout(revealAll, 2500);

    return () => {
      window.clearTimeout(timer);
      io.disconnect();
      revealAll();
      root.classList.remove('cbv2-reveal-on');
    };
  }, [pathname]);
}
