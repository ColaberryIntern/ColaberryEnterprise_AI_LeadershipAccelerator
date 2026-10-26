import React from 'react';
import type { GovCommitFeedItem } from '../../../../services/govProjectPortalApi';

/**
 * CommitFeed — the build-repo pushes that matched a task, newest first. Public commit facts only (sha, message,
 * when, the key it cited, whether a reviewer has verified it); no identity. A matched-but-unverified row reads
 * "needs review", a verified one reads "verified" — the same honesty rail as the board.
 */
function ago(iso: string | null): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const mins = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export default function CommitFeed({ feed }: { feed: GovCommitFeedItem[] }): React.ReactElement {
  return (
    <div className="gck-feed">
      <div className="gck-fh">
        <h2>Build repo pushes</h2>
        <span className="gck-chip gck-mono">matched commits</span>
      </div>
      {feed.length === 0 ? (
        <div className="gck-empty" style={{ padding: '16px' }}>
          No matched pushes yet. When a commit in the build repo cites a task key, it files evidence for that task and shows up here.
        </div>
      ) : (
        feed.map((f) => (
          <div className="gck-row" key={f.sha}>
            <span className="gck-mono">{f.sha.slice(0, 7)}</span>
            <div style={{ minWidth: 0 }}>
              <div className="msgtxt">{f.message}</div>
              <div className="sub">{ago(f.at)}</div>
            </div>
            <div className="gck-match">
              <span className={`gck-tag ${f.verified ? 'ok' : 'warn'}`}>{f.storyKey} &middot; {f.verified ? 'verified' : 'needs review'}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
