import React, { useEffect, useState } from 'react';
import { SectionCard, EmptyState } from './shell';
import {
  listProjectDemoLinks,
  type DemoLinkDirectory,
  type DemoLinkRow,
} from '../../services/projectDemoApi';

/**
 * DemoLinksPanel - every project's Connected Demo, and the link that opens the published ones.
 *
 * ## Its own component, not more rows in the page
 *
 * `AdminFactoryCommandCenterPage.tsx` is 477 lines against a 500-line hard ceiling. A panel of
 * this size inlined there would push it over, and CLAUDE.md's rule is that the next change to an
 * oversize file splits it first. One import and one element on the page; everything else here.
 *
 * ## Three states, and the one that is a trap
 *
 * published - a working public link, rendered as a link.
 * generated - a demo exists and the student has not published it. NO link: the token exists, the
 *             public route refuses it, and a staff member clicking through to a 404 would report a
 *             bug that is not one. The row says what is true instead.
 * none      - no demo yet.
 *
 * The backend withholds the token in SQL for anything but `published`, so this component cannot
 * build a broken link even if it tried. The copy is the second half of the same guarantee.
 *
 * ## Read only
 *
 * There is no publish control here on purpose. Exposing a student's work on an unauthenticated URL
 * is their decision, taken in their own portal. This panel shows staff what is already public.
 */

const STATE_LABEL: Record<DemoLinkRow['state'], string> = {
  published: 'Published',
  generated: 'Not published',
  none: 'No demo yet',
};

const STATE_BADGE: Record<DemoLinkRow['state'], string> = {
  published: 'bg-success-subtle text-success-emphasis',
  generated: 'bg-warning-subtle text-warning-emphasis',
  none: 'bg-light text-secondary',
};

/** An absolute link, so copying it out of this page gives somebody something that works. */
const absolute = (url: string): string =>
  (typeof window === 'undefined' ? url : `${window.location.origin}${url}`);

export default function DemoLinksPanel(): React.ReactElement {
  const [data, setData] = useState<DemoLinkDirectory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    listProjectDemoLinks()
      .then((d) => { if (live) { setData(d); setError(null); } })
      .catch(() => { if (live) setError('Could not load the demo directory.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);

  const copy = (url: string): void => {
    // Best effort. A clipboard that refuses (an insecure context, a denied permission) must not
    // throw into the render tree, and the link beside the button still works.
    navigator.clipboard?.writeText(absolute(url))
      .then(() => setCopied(url))
      .catch(() => setCopied(null));
  };

  const subtitle = data
    ? `${data.counts.published} published, ${data.counts.generated} not published, ${data.counts.none} with no demo`
    : undefined;

  return (
    <SectionCard
      title="Connected demo links"
      subtitle={subtitle}
      icon="external-link-line"
      collapsible
      defaultOpen={false}
    >
      {loading && <p className="text-secondary mb-0">Loading demo links...</p>}

      {!loading && error && (
        <div className="alert alert-warning mb-0" role="alert">{error}</div>
      )}

      {!loading && !error && data && data.rows.length === 0 && (
        <EmptyState
          icon="external-link-line"
          title="No projects yet"
          description="Published demos appear here with a link anyone can open."
          tone="quiet"
        />
      )}

      {!loading && !error && data && data.rows.length > 0 && (
        <>
          <div className="table-responsive">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th scope="col">Project</th>
                  <th scope="col">Demo</th>
                  <th scope="col" className="text-end">Moments</th>
                  <th scope="col">Public link</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.project_id}>
                    <td>{row.name || <span className="text-secondary">Unnamed project</span>}</td>
                    <td>
                      <span className={`badge ${STATE_BADGE[row.state]}`}>{STATE_LABEL[row.state]}</span>
                    </td>
                    <td className="text-end">{row.state === 'none' ? '' : row.event_count}</td>
                    <td>
                      {row.url ? (
                        <span className="d-inline-flex align-items-center gap-2">
                          <a href={row.url} target="_blank" rel="noopener noreferrer">Open demo</a>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => copy(row.url as string)}
                          >
                            {copied === row.url ? 'Copied' : 'Copy link'}
                          </button>
                        </span>
                      ) : (
                        <span className="text-secondary">
                          {row.state === 'generated'
                            ? 'Built, waiting for the student to publish it'
                            : 'No demo yet'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.truncated && (
            <p className="text-secondary small mb-0 mt-2">
              Showing the most recent projects only. There are more than this list holds.
            </p>
          )}
        </>
      )}
    </SectionCard>
  );
}
