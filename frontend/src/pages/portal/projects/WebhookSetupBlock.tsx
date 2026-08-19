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
 *
 * ── COLLAPSED IS NOT THE SAME AS GONE ────────────────────────────────────────
 *
 * The collapse above is right and stays. What was wrong was what it took with
 * it. The panel keyed BOTH "collapse this" and "the student no longer needs the
 * command" off the same ping, so the command disappeared from the page seconds
 * after the hook came into existence — and the one control left was labelled
 * "Change", which gives no hint the command is behind it.
 *
 * Million Abate hit it: their Claude Code agent asked them to paste the command,
 * and the portal had already tidied it away. Every student whose hook registers
 * before their agent asks for it walks into the same wall.
 *
 * Two things had been conflated and are now kept apart:
 *
 *   COLLAPSE follows the student's ACTION being done — the hook exists. Ali
 *     asked for that explicitly and it is unchanged.
 *
 *   THE COMMAND follows nothing. It is always one named click away, and always
 *     present once the panel is open, because "I already ran it" is not the same
 *     as "I will never need it again".
 *
 *   THE FINISHED TICK follows a real PUSH, not a ping. A ping proves GitHub can
 *     reach us; it proves nothing about the student's work arriving. The
 *     collapsed line now says which of the two has actually happened.
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

  /**
   * TWO SIGNALS, AND THEY ARE NOT THE SAME CLAIM.
   *
   * `hookRegistered` — GitHub has reached us from this repo at least once. A
   *   `ping` counts, and that is the point: it lands seconds after the command
   *   runs, so the step the student just performed can confirm itself.
   *
   * `pushesArriving` — a delivery has carried their own work through
   *   verification. Strictly narrower.
   *
   * The panel used to let the first stand in for "finished", which is how a ping
   * came to hide the command and tick the done mark in the same instant.
   */
  const hookRegistered = Boolean(setup?.last_delivery_at);
  const pushesArriving = Boolean(setup?.last_push_at);

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
      state: hookRegistered ? 'done' : 'waiting_you',
      detail: hookRegistered
        ? 'The hook exists — GitHub has reached us from this repo.'
        : 'Run the command below. GitHub confirms it here within seconds.',
    },
    {
      key: 'push',
      label: 'Pushes arriving',
      state: pushesArriving ? 'done' : 'waiting_github',
      detail: pushesArriving
        ? `Last push ${relative(setup?.last_push_at)}.`
        : hookRegistered
          ? 'Waiting for your first push. Nothing to do — it happens on its own.'
          : 'Starts once the webhook is registered.',
    },
  ], [hookRegistered, pushesArriving, repoLabel, setup?.last_push_at]);

  if (!setup?.supported || !setup.gh_command) return null;

  const doneCount = steps.filter((s) => s.state === 'done').length;

  /**
   * COLLAPSED once the student's part is done — which is when the webhook is
   * registered, not when pushes arrive. Pushing is a consequence, not a step
   * they perform, so holding the panel open waiting for it would keep nagging
   * about something already finished. Ali asked for this specifically: set it
   * once, never look at it again.
   */
  const settled = hookRegistered;

  if (settled && !expanded) {
    return (
      <div className="rt-hook settled">
        {/*
          The tick is this page's "done" mark, so it waits for a real push. A
          ping means the hook exists, which is worth saying in words — but
          spending the finished mark on it claims the loop is closed when
          nothing of the student's has come through yet.
        */}
        <span
          className={`rt-hook-check${pushesArriving ? ' on' : ''}`}
          aria-hidden="true"
        >
          {pushesArriving ? '✓' : ''}
        </span>
        <div className="rt-hook-oneline">
          <span className="rt-hook-repo">{repoLabel || 'Repo'}</span>
          <span className="rt-hook-sep">·</span>
          <span className="rt-hook-when">
            {pushesArriving
              ? `last push ${relative(setup.last_push_at)}`
              : 'webhook registered, waiting for your first push'}
          </span>
        </div>
        {/*
          NAMED FOR THE THING BEHIND IT, and this label is load-bearing.

          It read "Change" — the reasoning being that nothing was hidden and the
          only remaining want was to point the hook elsewhere. Both halves were
          wrong. The command WAS hidden: registering fires a ping, the ping
          collapsed this panel, and the command vanished from the page within
          seconds of the hook existing. And the remaining want is not to change
          anything — it is to run the command again, because Claude Code asks for
          it by name partway through Story 000.

          Million Abate hit exactly that: their agent asked them to paste the
          command and the portal had already tidied it away behind a word that
          gives no hint it is in there. A student hunting for "the command" must
          be able to see the word "command".
        */}
        <button className="rt-btn" onClick={() => setExpanded(true)}>Show command</button>
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

      {/*
        ALWAYS RENDERED WHILE THE PANEL IS OPEN, registered or not.

        This was gated on `!registered`, so the command deleted itself the moment
        the hook pinged — and the ping arrives seconds after the command runs.
        The student who most needs it is precisely the one who has already run it
        once: the agent asks for it again, or the hook is pointing at a stale
        URL, and re-running is the documented fix for both. The command is
        idempotent by construction server-side (it PATCHes an existing hook on
        our URL and only creates one when there is none), so offering it a second
        time cannot produce a duplicate hook.
      */}
      <div className="rt-hook-do">
        <div className="rt-lab">
          {hookRegistered ? 'The command, if you need it again' : 'Run this in your project folder'}
        </div>
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

      {hookRegistered && !pushesArriving && (
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
