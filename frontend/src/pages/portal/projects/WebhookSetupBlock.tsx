import React, { useCallback, useEffect, useState } from 'react';
import { getWebhookSetup, WebhookSetupView } from '../../../services/workspaceRepoApi';

/**
 * WebhookSetupBlock — the one-time step that turns "press Sync" into "it just
 * knows".
 *
 * ── WHY THE STUDENT DOES THIS AND NOT US ─────────────────────────────────────
 *
 * Webhooks are per repository. Student build repos are student-owned and the
 * platform deliberately holds no OAuth token for them — only a pointer and a
 * push proof. Rather than ask a cohort for an `admin:repo_hook` grant to
 * automate a one-minute setup, the student's own Claude Code registers it with
 * their own credentials. Same student-owned decision, one level further out.
 *
 * ── THE SECRET IS THE PART TO GET RIGHT ──────────────────────────────────────
 *
 * Student repos are public by default. A leaked per-repo secret lets somebody
 * forge push events for that repo, so the copy below tells the student — and by
 * extension the agent reading over their shoulder — NOT to put it in a file, in
 * the imperative, twice. Claude Code stops and asks about anything that looks
 * like a credential, and here that is exactly the behaviour we want.
 *
 * It is fetched from its own authenticated endpoint rather than riding along on
 * the repo view, so it is requested only when this block is actually shown.
 *
 * ── THE FALLBACK IS A REAL DOOR ──────────────────────────────────────────────
 *
 * `gh` missing or unauthenticated is not an edge case, it is Thursday. So the
 * manual path is not a consolation prize: a direct link to the exact GitHub page
 * with the two values laid out to copy, which is genuinely about as fast.
 */
export interface WebhookSetupBlockProps {
  projectId: string;
}

const WebhookSetupBlock: React.FC<WebhookSetupBlockProps> = ({ projectId }) => {
  const [setup, setSetup] = useState<WebhookSetupView | null>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (!projectId) return undefined;
    let cancelled = false;
    // Fails soft and silently: an unconfigured platform, or a blip, should leave
    // the student with the Sync button and no error about a feature they never
    // asked for.
    getWebhookSetup(projectId)
      .then((s) => { if (!cancelled) setSetup(s); })
      .catch(() => { if (!cancelled) setSetup(null); });
    return () => { cancelled = true; };
  }, [projectId]);

  const copy = useCallback((what: string, value: string) => {
    if (navigator.clipboard && value) navigator.clipboard.writeText(value);
    setCopied(what);
    window.setTimeout(() => setCopied(''), 1600);
  }, []);

  if (!setup?.supported || !setup.gh_command) return null;

  const live = Boolean(setup.last_delivery_at);

  return (
    <div className="rt-hook">
      <div className="rt-hook-h">
        <span className={`rt-hook-dot${live ? ' on' : ''}`} aria-hidden="true" />
        <div className="rt-hook-t">
          {live ? 'The platform sees your pushes' : 'Let the platform see your pushes'}
        </div>
        <button
          className="rt-btn"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="rt-hook-body"
        >
          {open ? 'Hide' : live ? 'Set up again' : 'Set it up'}
        </button>
      </div>

      <p className="rt-hook-s">
        {live
          ? <>Your last push reached us {relative(setup.last_delivery_at)}. Stories verify on push — you do not need to press Sync.</>
          : <>One command, once. After it, your criteria tick and stories verify the moment you push, instead of when you press Sync. Skip it and everything still works — you just press Sync yourself.</>}
      </p>

      {open && (
        <div id="rt-hook-body">
          <div className="rt-lab">Run this in your project folder</div>
          <pre className="rt-in mono rt-hook-cmd">{setup.gh_command}</pre>
          <div className="rt-row">
            <button
              className={`rt-btn${copied === 'cmd' ? ' pri' : ''}`}
              onClick={() => copy('cmd', setup.gh_command || '')}
            >
              {copied === 'cmd' ? 'Copied' : 'Copy command'}
            </button>
          </div>

          {/* Said in the imperative, and said before the fallback rather than
              after it, because this is the sentence that has to survive being
              skim-read. */}
          <p className="rt-hook-warn">
            <strong>Do not save this command to a file, commit it, or paste it into .env.</strong> It
            carries a signing secret for your repo, and your repo is public. Run it, then let it go —
            you can always come back here for it.
          </p>

          <div className="rt-lab">If that did not work</div>
          <p className="rt-hook-s" style={{ marginTop: 0 }}>
            No <code>gh</code>, or not signed in? Run <code>gh auth login</code> and try again. If GitHub
            refuses with a permissions error, run <code>gh auth refresh -h github.com -s admin:repo_hook</code>.
            Or add it by hand in about a minute:
          </p>
          <ol className="rt-hook-l">
            <li>
              Open <a href={setup.settings_url || '#'} target="_blank" rel="noreferrer">your repo's webhook page ↗</a>
            </li>
            <li>
              <strong>Payload URL</strong>
              <div className="rt-hook-kv">
                <code>{setup.payload_url}</code>
                <button className="rt-btn" onClick={() => copy('url', setup.payload_url || '')}>
                  {copied === 'url' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
            <li>
              <strong>Content type</strong> — <code>application/json</code>
            </li>
            <li>
              <strong>Secret</strong>
              <div className="rt-hook-kv">
                <code className="rt-hook-secret">{setup.secret}</code>
                <button className="rt-btn" onClick={() => copy('secret', setup.secret || '')}>
                  {copied === 'secret' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </li>
            <li>Leave it on <strong>Just the push event</strong>, and save.</li>
          </ol>
        </div>
      )}
    </div>
  );
};

/** Coarse and forgiving — this is reassurance, not a timestamp anybody acts on. */
function relative(iso: string | null): string {
  if (!iso) return 'recently';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return hrs === 1 ? 'an hour ago' : `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export default WebhookSetupBlock;
