import { useEffect, useState } from 'react';
import { fetchLandingPageAudience, type LandingPageVisitor } from '../../../services/landingPageApi';

/**
 * Who landed on one page, and the metric tiles that sit beside the count.
 *
 * WHY IT EXISTS. Ali, 2026-10-15: "how do we see who and how many are landing on the landing
 * pages? where is that?" Nowhere - the tracker had been recording every view for weeks and no
 * screen in the product showed any of it.
 *
 * PEOPLE FIRST, LOADS LAST. The live page measured 11 visitors, 24 sessions and 192 views over
 * thirty days. All three are true and only the first answers "how many people". A panel that
 * leads with 192 is not wrong so much as misleading, so visitors is the big number and views is
 * the quiet one beside it.
 *
 * AN UNMEASURABLE PAGE SAYS SO. A hosted page with no `site_slug` carries no tracker at all - the
 * renderer omits it - so its zeros mean "cannot be measured", not "nobody came". Showing those as
 * a plain 0 would be a lie of omission, and the operator would reasonably conclude the campaign
 * failed.
 *
 * Extracted from `LandingPageTrafficPanel` on 2026-10-16, when the standalone traffic panel was
 * folded into the page table: the same page was being listed twice on one screen, once to be
 * worked on and once to be measured.
 */

export function Metric({ value, label, muted }: { value: number; label: string; muted?: boolean }) {
  return (
    <div className="text-center px-2">
      <div className={`fw-bold ${muted ? 'fs-6 text-muted' : 'fs-4'}`} style={{ lineHeight: 1.1 }}>
        {value.toLocaleString()}
      </div>
      <div className="text-muted" style={{ fontSize: '.7rem' }}>{label}</div>
    </div>
  );
}

export function when(iso: string | null): string {
  if (!iso) return '—';
  // Central, like every other time this team reads.
  return new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The names behind the visitor count, fetched only when asked for.
 *
 * THE ANONYMOUS COUNT IS SHOWN BESIDE THE NAMES, ALWAYS. The live page had two named people and
 * sixteen anonymous. A list of two on its own reads as "almost nobody came"; the truth is
 * "eighteen came and most have not told us who they are yet", and a landing page's whole job is
 * to turn the second number into the first.
 */
export function AudienceDisclosure({ path, days }: { path: string; days: number }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{
    people: LandingPageVisitor[]; totalVisitors: number; anonymousVisitors: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let live = true;
    fetchLandingPageAudience(path, days)
      .then((r) => { if (live) setData(r); })
      .catch(() => { if (live) setError('Could not load who landed.'); });
    return () => { live = false; };
  }, [open, data, path, days]);

  return (
    <div className="mt-2">
      <button
        type="button"
        className="btn btn-link btn-sm p-0 text-decoration-none"
        style={{ fontSize: '.78rem' }}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        data-testid="lp-audience-toggle"
      >
        {open ? 'Hide who landed' : 'Who landed?'}
      </button>

      {open && error && <div className="small text-danger mt-1">{error}</div>}
      {open && !error && !data && <div className="small text-muted mt-1">Loading…</div>}

      {open && data && (
        <div className="mt-2" data-testid="lp-audience">
          {data.people.length === 0 ? (
            <p className="small text-muted mb-1">
              Nobody here has given us an email yet.
            </p>
          ) : (
            <ul className="list-unstyled mb-1 small">
              {data.people.map((p) => (
                <li key={p.leadId} className="d-flex gap-2 align-items-baseline flex-wrap">
                  <span className="fw-semibold">{p.name && p.name !== p.email ? p.name : (p.email ?? 'Unknown')}</span>
                  {p.name && p.name !== p.email && p.email && (
                    <span className="text-muted">{p.email}</span>
                  )}
                  {p.clicked && (
                    <span className="badge bg-success-subtle text-success-emphasis">clicked</span>
                  )}
                  <span className="text-muted" style={{ fontSize: '.72rem' }}>
                    last seen {when(p.lastTouch)} CT
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Never the names alone. See the header. */}
          <p className="text-muted mb-0" style={{ fontSize: '.72rem' }}>
            {data.anonymousVisitors} of {data.totalVisitors} visitors are anonymous - they have
            not given an email yet, so there is no name to show.
          </p>
        </div>
      )}
    </div>
  );
}
