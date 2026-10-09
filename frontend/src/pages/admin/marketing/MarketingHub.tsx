import React from 'react';
import { Link } from 'react-router-dom';

/**
 * MarketingHub - the way into every Marketing surface, now that the rail has one button.
 *
 * WHY. Ali, 2026-10-08: "minimize the navigation on the left side down to preferably one button
 * so that means every page should have some type of connection on the dashboard to be able to
 * navigate through the dashboard verses multiple pages."
 *
 * The second half of that sentence is the load-bearing one. Eight sidebar rows collapsing to one
 * is only an improvement if the Overview then carries the doors; collapse the rail without this
 * and seven pages become reachable only by typing a URL. So this is not decoration - it is the
 * navigation that used to live in the rail, moved onto the page it was always describing.
 *
 * EVERY ROUTE IS LISTED, and a test pins that against the router, because a page with no door is
 * exactly the failure this change could introduce and nothing else would catch it.
 *
 * ORDERED BY THE WORK, not alphabetically and not by how the code is arranged: write something,
 * see what is written, see when it goes out, build somewhere to send people, watch it go, read
 * what happened, set up who it goes as.
 */

export interface MarketingHubDestination {
  to: string;
  label: string;
  /** What this page is for, in the operator's words rather than the system's. */
  blurb: string;
  icon: string;
}

export const MARKETING_DESTINATIONS: readonly MarketingHubDestination[] = [
  { to: '/admin/marketing/composer', label: 'New post', blurb: 'Write once, publish to each network with tracked links.', icon: 'quill-pen-line' },
  { to: '/admin/marketing/content', label: 'All posts', blurb: 'Everything drafted, scheduled or published, for this brand.', icon: 'list-check-2' },
  { to: '/admin/marketing/calendar', label: 'Calendar', blurb: 'What is going out and when, in Central time.', icon: 'calendar-2-line' },
  { to: '/admin/marketing/landing-pages', label: 'Landing pages', blurb: 'Build a page from a brief and publish it with tracking wired.', icon: 'layout-masonry-line' },
  { to: '/admin/marketing/publishing', label: 'Publishing queue', blurb: 'What is in flight, what failed, and what needs a person.', icon: 'send-plane-line' },
  { to: '/admin/marketing/performance', label: 'Performance', blurb: 'Funnel, revenue, campaign links and the outreach queue.', icon: 'line-chart-line' },
  { to: '/admin/marketing/brands', label: 'Brands & channels', blurb: 'Where each brand posts from, and whether it still can.', icon: 'price-tag-3-line' },
];

export default function MarketingHub() {
  return (
    <div className="row g-2" data-testid="marketing-hub">
      {MARKETING_DESTINATIONS.map((d) => (
        <div className="col-12 col-md-6 col-xl-4" key={d.to}>
          <Link
            to={d.to}
            className="d-flex gap-3 text-decoration-none border rounded-3 bg-white p-3 h-100"
            data-testid={`hub-${d.to.split('/').pop()}`}
          >
            <i className={`ri-${d.icon} fs-5 text-primary`} aria-hidden="true" />
            <span className="d-block">
              <span className="d-block fw-semibold text-body">{d.label}</span>
              <span className="d-block small text-muted mt-1">{d.blurb}</span>
            </span>
          </Link>
        </div>
      ))}
    </div>
  );
}
