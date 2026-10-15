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

export type HubGroup = 'Plan & write' | 'Ship & measure' | 'Set up';

export interface MarketingHubDestination {
  to: string;
  /** Which stage of the work this door belongs to. */
  group: HubGroup;
  label: string;
  /** What this page is for, in the operator's words rather than the system's. */
  blurb: string;
  icon: string;
}

export const MARKETING_DESTINATIONS: readonly MarketingHubDestination[] = [
  { to: '/admin/marketing/composer', group: 'Plan & write', label: 'New post', blurb: 'Write once, publish to each network with tracked links.', icon: 'quill-pen-line' },
  { to: '/admin/marketing/content', group: 'Plan & write', label: 'All posts', blurb: 'Everything drafted, scheduled or published, for this brand.', icon: 'list-check-2' },
  { to: '/admin/marketing/calendar', group: 'Plan & write', label: 'Calendar', blurb: 'What is going out and when, in Central time.', icon: 'calendar-2-line' },
  { to: '/admin/marketing/landing-pages', group: 'Plan & write', label: 'Landing pages', blurb: 'Build a page from a brief and publish it with tracking wired.', icon: 'layout-masonry-line' },
  { to: '/admin/marketing/publishing', group: 'Ship & measure', label: 'Publishing queue', blurb: 'What is in flight, what failed, and what needs a person.', icon: 'send-plane-line' },
  { to: '/admin/marketing/performance', group: 'Ship & measure', label: 'Performance', blurb: 'Funnel, revenue, campaign links and the outreach queue.', icon: 'line-chart-line' },
  { to: '/admin/marketing/brands', group: 'Set up', label: 'Brands & channels', blurb: 'Where each brand posts from, and whether it still can.', icon: 'price-tag-3-line' },
];

export const HUB_GROUPS: readonly HubGroup[] = ['Plan & write', 'Ship & measure', 'Set up'];

/**
 * GROUPED, NOT A FLAT SEVEN. Seven equal cards is a list to read; three labelled stages is a
 * shape to recognise, and the labels say what the work IS - write it, ship it and see how it
 * went, set up who it goes as. An operator looking for Performance does not scan seven blurbs,
 * they look under "Ship & measure".
 */
export default function MarketingHub() {
  return (
    <div className="row g-3" data-testid="marketing-hub">
      {HUB_GROUPS.map((group) => (
        <div className="col-12 col-lg-4" key={group}>
          <div
            className="text-uppercase text-muted fw-semibold mb-2"
            style={{ fontSize: '.68rem', letterSpacing: '.08em' }}
          >
            {group}
          </div>
          <div className="d-flex flex-column gap-2">
            {MARKETING_DESTINATIONS.filter((d) => d.group === group).map((d) => (
              <Link
                to={d.to}
                key={d.to}
                className="d-flex gap-3 text-decoration-none border rounded-3 bg-white p-3"
                data-testid={`hub-${d.to.split('/').pop()}`}
              >
                <i className={`ri-${d.icon} fs-5 text-primary`} aria-hidden="true" />
                <span className="d-block">
                  <span className="d-block fw-semibold text-body">{d.label}</span>
                  <span className="d-block small text-muted mt-1">{d.blurb}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
