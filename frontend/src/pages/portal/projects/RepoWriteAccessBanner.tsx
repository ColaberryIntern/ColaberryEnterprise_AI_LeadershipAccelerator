import React from 'react';

/**
 * RepoWriteAccessBanner — the platform can read this student's repo but cannot
 * write to it, and here is exactly what to do about it.
 *
 * WHY A BANNER AND NOT THE CHIP. The build card already shows "not syncing to
 * GitHub" with the instruction in a hover title. Measured on production
 * 2026-09-15: 14 of 26 active students with a connected repo were in this state,
 * and one of them wrote in to ask why his Command Center said "no data yet".
 * Nothing connected "not syncing" to "my dashboard is empty", and a tooltip is
 * not a place anyone reads a three-step fix. This sits where the student is when
 * they notice, says what it costs them, and links straight to the page on GitHub
 * where the grant is made.
 *
 * WHAT IS ACTUALLY BROKEN. The Command Center, the plan, and the progress file
 * live IN the student's repo and are pushed there by the platform. With no write
 * access those files freeze at whatever was last committed. Reads still work,
 * verification still works, points still pay. It is the repo-side mirror that
 * stops, which is precisely the part the student looks at.
 *
 * WHY IT HAS TO BE THE STUDENT. Only a repository owner can add a collaborator.
 * An unaccepted invitation is deleted by GitHub after seven days and cannot be
 * recovered, so a student who "already added ColaberryIntern" weeks ago and saw
 * nothing happen almost certainly has an expired grant, and the honest advice is
 * to add it again. The platform accepts pending invitations on an hourly sweep.
 */

/** The GitHub account the student adds. Changing it here changes nothing else;
 *  it must match what `repoInvitations` accepts for. */
export const PLATFORM_GITHUB_LOGIN = 'ColaberryIntern';

/** `https://github.com/owner/repo` -> `https://github.com/owner/repo/settings/access`, else null. */
export function collaboratorsUrl(repoUrl: string | null | undefined): string | null {
  const m = /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s#?]+)/i.exec((repoUrl || '').trim());
  if (!m) return null;
  return `https://github.com/${m[1]}/${m[2].replace(/\.git$/i, '')}/settings/access`;
}

interface Props {
  /** From `repo_sync` on the projects list. Renders only on a recorded 'blocked'. */
  state?: string | null;
  repoUrl?: string | null;
  /** Takes the student to the workspace, where the repo panel's Reconnect lives. */
  onOpenWorkspace?: () => void;
}

const RepoWriteAccessBanner: React.FC<Props> = ({ state, repoUrl, onOpenWorkspace }) => {
  if (state !== 'blocked') return null;
  const link = collaboratorsUrl(repoUrl);
  const repoName = (() => {
    const m = /github\.com\/([^/\s]+\/[^/\s#?]+)/i.exec(repoUrl || '');
    return m ? m[1].replace(/\.git$/i, '') : 'your repository';
  })();

  return (
    <section className="pjw-banner" role="alert" aria-label="Colaberry cannot write to your repository">
      <div className="pjw-head">
        <span className="pjw-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        </span>
        <div>
          <h3>Colaberry can read your repo but cannot write to it</h3>
          <p>
            Your Command Center, your plan, and your progress file live inside <strong>{repoName}</strong> and
            the platform pushes them there. Without write access they stopped updating, which is why the
            Command Center shows old data or none. Nothing you have built is lost: it all syncs the moment
            you grant access.
          </p>
        </div>
      </div>

      <ol className="pjw-steps">
        <li>
          {link
            ? <>Open <a href={link} target="_blank" rel="noopener noreferrer">the collaborators page for {repoName}</a> on GitHub.</>
            : <>On GitHub, open your repository, then <strong>Settings</strong>, then <strong>Collaborators</strong>.</>}
        </li>
        <li>
          Add <code>{PLATFORM_GITHUB_LOGIN}</code> with <strong>Write</strong> access.
        </li>
        <li>
          Come back and press <strong>Reconnect</strong> on the repo panel in your workspace. Colaberry
          accepts the invitation within the hour.
        </li>
      </ol>

      <p className="pjw-note">
        Added {PLATFORM_GITHUB_LOGIN} before and nothing changed? GitHub deletes an invitation nobody
        accepts after seven days, and it cannot be recovered. Add it again.
      </p>

      {onOpenWorkspace && (
        <div className="pjw-actions">
          <button type="button" className="pw-act copy" onClick={onOpenWorkspace}>Open the workspace</button>
        </div>
      )}
    </section>
  );
};

export default RepoWriteAccessBanner;
