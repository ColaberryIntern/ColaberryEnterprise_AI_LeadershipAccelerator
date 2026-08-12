import { useEffect } from 'react';

/**
 * useReveal -- scroll-triggered reveals that cannot strand content.
 *
 * The prototype shipped a version of this that set `.rv { opacity: 0 }` in CSS
 * and relied on an IntersectionObserver to add the visible class. Full-page
 * screenshots came back blank below the fold, because an observer never fires
 * for elements that are offscreen when it is created and never scrolled to.
 *
 * Three defences, all of them deliberate:
 *   1. CSS defaults to visible. The hidden state only applies under
 *      html.cbv2-reveal-on, which is added HERE -- so if this hook never runs,
 *      or JS fails entirely, every section is simply visible.
 *   2. A safety timer reveals everything after 2.5s regardless of the observer.
 *   3. Sections are observed, never individual cards. Nested and re-rendered
 *      cards were the ones that never received the class.
 */
export default function useReveal(): void {
  useEffect(() => {
    const root = document.documentElement;
    const targets = Array.from(document.querySelectorAll('.cbv2-rv'));
    if (!targets.length) return undefined;

    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // With reduced motion we never opt in, so content just renders.
    if (reduced || typeof IntersectionObserver !== 'function') return undefined;

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

    // Safety net: whatever happens, nothing stays hidden.
    const timer = window.setTimeout(revealAll, 2500);

    return () => {
      window.clearTimeout(timer);
      io.disconnect();
      revealAll();
      root.classList.remove('cbv2-reveal-on');
    };
  }, []);
}
