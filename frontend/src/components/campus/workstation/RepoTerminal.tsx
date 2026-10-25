import React from 'react';
import type { WorkspaceRepoView } from '../../../services/workspaceRepoApi';

/**
 * The left monitor for a story (round 3 §2.3 "repo terminal", the prototype's .term): the repo, the last sync, the commit log and
 * the "watching .colaberry/progress.json" line. Read-only by design: connecting, syncing and choosing another repo stay in "How to
 * build it" on the main monitor (WorkspaceRepoPanel), whose order is load-bearing (the prompt's Step 1 points at that panel), so
 * the build logic has one home. Real data only: no repo reads as "No repo connected yet", never a sample.
 */
const LOG_MAX = 8;

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function RepoTerminal({ repo }: { repo: WorkspaceRepoView | null }): React.ReactElement {
  const name = repo?.repo_owner && repo?.repo_name ? `${repo.repo_owner}/${repo.repo_name}` : null;
  const commits = (repo?.recent_commits ?? []).slice(0, LOG_MAX);
  return (
    <div className="cm-ws-term" data-testid="cm-ws-term">
      <div className="th"><i className="r" /><i className="y" /><i className="g" /><span>REPO</span></div>
      <div className="repo">
        {name ? (
          <>
            Connected repo
            {repo?.repo_url ? <a href={repo.repo_url} target="_blank" rel="noopener noreferrer">{name}</a> : <b>{name}</b>}
            {repo?.last_sync && <span className="d">Last sync {when(repo.last_sync)}</span>}
          </>
        ) : <>No repo connected yet. Connect it under <b>How to build it</b> on the main screen.</>}
      </div>
      <div className="log" aria-label="Recent commits">
        {name && <div className="h">watching .colaberry/progress.json</div>}
        {commits.map((c) => (
          <div key={c.sha}><span className="g">{c.sha.slice(0, 7)}</span> {c.message.split('\n')[0]} <span className="d">{when(c.date)}</span></div>
        ))}
        {name && !commits.length && <div className="d">No commits yet. Push from your editor and they land here.</div>}
      </div>
    </div>
  );
}
