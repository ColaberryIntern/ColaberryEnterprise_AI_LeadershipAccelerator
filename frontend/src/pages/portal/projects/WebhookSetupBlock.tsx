import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getWebhookSetup, WebhookSetupView } from '../../../services/workspaceRepoApi';

/**
 * WebhookSetupBlock — the one-time plumbing, as a checklist that tells you where
 * you are.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────
 *
 * Setup is genuinely three steps, and the old block presented it as one
 * undifferentiated panel behind a single grey dot. A student could not tell
 * which parts were done, what was left, or — worst of all — whether the command
 * they had just run had worked. Ali's words: "it is a multi step setup and we
 * need to understand when one is completed."
 *
 * ── THE VISUAL LANGUAGE IS BORROWED, DELIBERATELY ────────────────────────────
 *
 * Checkmarks, matching "Done means" on the same page, because that is what
 * already reads as *done* here and setup should look like it belongs to the same
 * product rather than inventing a third idiom.
 *
 * ── BUT IT IS ITS OWN BLOCK, AND MUST STAY THAT WAY ──────────────────────────
 *
 * The obvious next thought is "just add these as extra checkmarks inside Done
 * means". Do not:
 *
 *   - Those three criteria are what the PLATFORM VERIFIES from the repo to
 *     complete the story. The webhook is deliberately optional — hosting was
 *     kept out of the criteria for exactly this reason. Putting setup in that
 *     list makes an optional step read as required and reintroduces the
 *     stuck-story failure in a new costume.
 *   - The "n of m confirmed" count would start mixing plumbing with the
 *     deliverable. "3 of 5" tells a student nothing about which two are missing
 *     or whether they even matter.
 *   - "Done means" is per-story. Setup is once per project. Story 001 onward
 *     would either repeat it forever or drop it inconsistently.
 *
 * One thing this block does that "Done means" must never do: once complete it
 * COLLAPSES to a single quiet line. Setup is finished and nobody will look at it
 * again; the criteria are the point of the page and always stay open.
 *
 * ── EVERY STATE IS SERVER TRUTH ──────────────────────────────────────────────
 *
 * Same rule as the acceptance checkboxes: a setup step that claims done when it
 * is not is the same class of lie. "Registered" means we have actually received
 * a delivery from this repo — not that the student pressed a button. GitHub
 * fires a `ping` the moment a hook is created, so that evidence arrives within
 * seconds of the command running, which is what makes the honest signal also the
 * fast one.
 */
export interface WebhookSetupBlockProps {
  projectId: string;
  /** Owner/name for the first step, which is already done by the time we render. */
  repoLabel?: string | null;
}

type StepState = 'done' | 'waiting_you' | 'waiting_github';

interface Step {
  key: string;
  label: string;
  state: StepState;
  /** Shown under the label. Always a fact, never a guess. */
  detail: string;
}

const WebhookSetupBlock: React.FC<WebhookSetupBlockProps> = ({ projectId, repoLabel }) => {
  const [setup, setSetup] = useState<WebhookSetupView | null>(null);
  const [expanded, setExpanded] = useState(false);
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

  const registered = Boolean(setup?.last_delivery_at);
  const pushing = Boolean(setup?.last_push_at);

  const steps = useMemo<Step[]>(() => [
    {
      key: 'repo',
      label: 'Repo connected',
      state: 'done',
      detail: repoLabel || 'Your workspace repo is linked.',
    },
    {
      key: 'hook',
      label: 'Webhook registered',
      state: registered ? 'done' : 'waiting_you',
      detail: registered
        ? 'GitHub has reached us from this repo.'
        : 'Run the command below. GitHub confirms it here within seconds.',
    },
    {
      key: 'push',
      label: 'Pushes arriving',
      state: pushing ? 'done' : registered ? 'waiting_github' : 'waiting_github',
      detail: pushing
        ? `Last push ${relative(setup?.last_push_at)}.`
        : registered
          ? 'Waiting for your first push. Nothing to do — it happens on its own.'
          : 'Starts once the webhook is registered.',
    },
  ], [registered, pushing, repoLabel, setup?.last_push_at]);

  if (!setup?.supported || !setup.gh_command) return null;

  const doneCount = steps.filter((s) => s.state === 'done').length;

  /**
   * COLLAPSED once the student's part is done — which is when the webhook is
   * registered, not when pushes arrive. Pushing is a consequence, not a step
   * they perform, so holding the panel open waiting for it would keep nagging
   * about something already finished.
   */
  const settled = registered;
  const open = expanded || !settled;

  if (settled && !expanded) {
    return (
      <div className="rt-hook settled">
        <span className="rt-hook-check on" aria-hidden="true">✓</span>
        <div className="rt-hook-oneline">
          <span className="rt-hook-repo">{repoLabel || 'Repo'}</span>
          <span className="rt-hook-sep">·</span>
          <span className="rt-hook-when">
            {pushing ? `last push ${relative(setup.last_push_at)}` : 'waiting for your first push'}
          </span>
        </div>
        {/* "Hide" was the wrong verb here — nothing is being hidden, and the one
            thing a student might want is to point it somewhere else. */}
        <button className="rt-btn" onClick={() => setExpanded(true)}>Change</button>
      </div>
    );
  }

  return (
    <div className="rt-hook">
      <div className="rt-hook-h">
        <div className="rt-hook-t">Let the platform see your pushes</div>
        <span className="rt-hook-count">{doneCount} of {steps.length}</span>
        {settled && (
          <button className="rt-btn" onClick={() => setExpanded(false)}>Done</button>
        )}
      </div>

      <ol className="rt-hook-steps">
        {steps.map((s) => (
          <li key={s.key} className={`rt-hook-step ${s.state}`}>
            <span className="rt-hook-check" aria-hidden="true">{s.state === 'done' ? '✓' : ''}</span>
            <div>
              <div className="rt-hook-step-l">
                {s.label}
                {s.state === 'waiting_you' && <span className="rt-hook-tag you">Your turn</span>}
                {s.state === 'waiting_github' && <span className="rt-hook-tag gh">Waiting on GitHub</span>}
              </div>
              <div className="rt-hook-step-d">{s.detail}</div>
            </div>
          </li>
        ))}
      </ol>

      {!registered && (
        <div className="rt-hook-do">
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

          {/* Stays loud for as long as the command is on screen. This one earns
              its weight: the repo is public and the command carries a secret. */}
          <p className="rt-hook-warn">
            <strong>Do not save this command to a file, commit it, or paste it into .env.</strong> It
            carries a signing secret for your repo, and your repo is public. Run it, then let it go —
            you can always come back here for it.
          </p>

          <details className="rt-hook-alt">
            <summary>If that did not work</summary>
            <p className="rt-hook-step-d">
              No <code>gh</code>, or not signed in? Run <code>gh auth login</code> and try again. If GitHub
              refuses with a permissions error, run <code>gh auth refresh -h github.com -s admin:repo_hook</code>.
              Or add it by hand in about a minute:
            </p>
            <ol className="rt-hook-l">
              <li><a href={setup.settings_url || '#'} target="_blank" rel="noreferrer">Open your repo's webhook page ↗</a></li>
              <li>
                <strong>Payload URL</strong>
                <div className="rt-hook-kv">
                  <code>{setup.payload_url}</code>
                  <button className="rt-btn" onClick={() => copy('url', setup.payload_url || '')}>
                    {copied === 'url' ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </li>
              <li><strong>Content type</strong> — <code>application/json</code></li>
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
          </details>
        </div>
      )}

      {registered && !pushing && (
        <p className="rt-hook-step-d rt-hook-foot">
          Nothing left to do here. Push a commit and this finishes itself.
        </p>
      )}
    </div>
  );
};

/**
 * Coarse and forgiving — reassurance, not a timestamp anybody acts on.
 *
 * Returns null-safe text only for a real instant. A missing or unparseable value
 * yields "recently" ONLY when the caller has already established that something
 * did arrive; it is never used to invent an event that did not happen.
 */
function relative(iso: string | null | undefined): string {
  if (!iso) return 'recently';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'recently';
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'just now';
  if (mins === 1) return 'a minute ago';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.round(mins / 60);
  if (hrs === 1) return 'an hour ago';
  if (hrs < 24) return `${hrs} hours ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

export default WebhookSetupBlock;
