import React, { useEffect, useState } from 'react';

/**
 * OurServicesSectionNav - the sticky jump bar at the top of Our Services (Ali, 16 Nov 2026: "it is all the way at the
 * bottom; give me navigation at the top"). One pill per section, the section in view is highlighted, and a click
 * scrolls there and puts the anchor in the URL so the link can be shared. Sections that are not on the page (the
 * summary failed to load) are left out rather than shown as dead links.
 *
 * Each target section carries `scroll-margin-top` (OUR_SERVICES_SCROLL_MARGIN) so the bar never covers its heading.
 */
export interface SectionNavItem {
  id: string;
  label: string;
  icon: string;
  /** Optional count shown on the pill (e.g. blocked case studies); tone colors it. */
  badge?: { text: string; tone: 'danger' | 'success' | 'secondary' };
  /** Called instead of only scrolling, for a section that must open first (the collapsed dossier). */
  onSelect?: () => void;
}

export const OUR_SERVICES_SCROLL_MARGIN = 72;

const BADGE: Record<NonNullable<SectionNavItem['badge']>['tone'], string> = {
  danger: 'bg-danger-subtle text-danger-emphasis',
  success: 'bg-success-subtle text-success-emphasis',
  secondary: 'bg-body-tertiary text-body-secondary',
};

export function scrollToSection(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (typeof window !== 'undefined' && window.history?.replaceState) window.history.replaceState(null, '', `#${id}`);
}

export default function OurServicesSectionNav({ items }: { items: SectionNavItem[] }): React.ReactElement | null {
  const [active, setActive] = useState<string | null>(null);

  // Highlight whichever section is nearest the top of the viewport. No IntersectionObserver (jsdom, old browsers):
  // the bar still works, it just does not highlight.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof IntersectionObserver === 'undefined') return undefined;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) seen.set(e.target.id, e.isIntersecting);
      const first = items.find((it) => seen.get(it.id));
      if (first) setActive(first.id);
    }, { rootMargin: `-${OUR_SERVICES_SCROLL_MARGIN}px 0px -55% 0px` });
    for (const it of items) { const el = document.getElementById(it.id); if (el) io.observe(el); }
    return () => io.disconnect();
  }, [items]);

  if (!items.length) return null;
  return (
    <nav aria-label="Our Services sections" data-testid="our-services-nav"
      className="sticky-top bg-body border-bottom mb-3 py-2"
      style={{ top: 0, zIndex: 1020, marginLeft: -4, marginRight: -4, paddingLeft: 4, paddingRight: 4 }}>
      <ul className="nav nav-pills flex-nowrap gap-1 small mb-0" style={{ overflowX: 'auto', scrollbarWidth: 'thin' }}>
        {items.map((it) => {
          const on = active === it.id;
          return (
            <li className="nav-item flex-shrink-0" key={it.id}>
              <a href={`#${it.id}`} className={`nav-link py-1 px-2 text-nowrap ${on ? 'active' : 'text-body-secondary'}`}
                aria-current={on ? 'location' : undefined} data-testid={`section-nav-${it.id}`}
                onClick={(e) => { e.preventDefault(); setActive(it.id); it.onSelect?.(); scrollToSection(it.id); }}>
                <i className={`ri-${it.icon} me-1`} aria-hidden="true" />{it.label}
                {it.badge && <span className={`badge rounded-pill ms-1 ${BADGE[it.badge.tone]}`}>{it.badge.text}</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
