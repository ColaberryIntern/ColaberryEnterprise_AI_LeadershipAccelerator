import React, { useState } from 'react';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import { draftBodyToText } from './draftBodyToText';
import {
  getDraftHistory,
  regenerateDraft,
  type ExplorerDraftVersion,
  type ExplorerWhyMessage,
} from '../../services/explorerGrowthApi';

/**
 * The revision surface for one decision's draft: what the copy was allowed to cite, who it
 * was written as, a button to ask for another attempt, and a diff against the version it
 * replaced.
 *
 * ## Why this is a separate file
 *
 * `DecisionWhyModal.tsx` was already near this repo's 500-line hard ceiling, and the rule
 * is that the next change to a file at the ceiling splits it before adding code. These four
 * things are one concern — the revision of a draft — so they travel together rather than
 * being scattered to keep a line count down.
 *
 * ## Everything here states its negatives
 *
 * The pattern the rest of this page already uses, for the same reason: an absent badge and
 * a checked-and-found-nothing badge look identical, and they lead to opposite actions. So
 * "no sources" distinguishes *the knowledge base could not be read* from *it was read and
 * offered nothing quotable*, and "no published voice" is said out loud rather than omitted.
 */

/** One line of a diff. */
export interface DiffLine {
  kind: 'same' | 'added' | 'removed';
  text: string;
}

/**
 * A line-level diff, longest-common-subsequence based.
 *
 * PURE AND EXPORTED, so the interesting cases are driven directly rather than through a
 * rendered component. A naive implementation — zip the two line arrays and compare by
 * index — reports every line after a single insertion as changed, which on a four-paragraph
 * email means the diff says "everything changed" the one time a reviewer most needs to see
 * that only the opening did. LCS is what makes an insertion read as an insertion.
 *
 * Operates on the TEXT, never the HTML: a reviewer is comparing words, and markup churn
 * from the generator would otherwise dominate the diff.
 */
export function diffLines(previous: string, current: string): DiffLine[] {
  const a = previous.split('\n');
  const b = current.split('\n');

  // lcs[i][j] = length of the longest common subsequence of a[i..] and b[j..].
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: 'removed', text: a[i] });
      i += 1;
    } else {
      out.push({ kind: 'added', text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ kind: 'removed', text: a[i] });
    i += 1;
  }
  while (j < b.length) {
    out.push({ kind: 'added', text: b[j] });
    j += 1;
  }

  return out;
}

/** True when the two texts differ at all. Used to say "identical" rather than show nothing. */
export function hasChanges(lines: readonly DiffLine[]): boolean {
  return lines.some((l) => l.kind !== 'same');
}

/**
 * The knowledge entries this copy was allowed to draw on.
 *
 * Each links into the hub, so a reviewer can check a sentence against the entry it came
 * from rather than trusting that it matched.
 */
export function SourcesList({ m }: { m: ExplorerWhyMessage }) {
  if (m.cited.length === 0) {
    return (
      <div className="text-muted small" data-testid="sources-empty">
        {m.knowledge_available
          ? 'The knowledge base was read and offered nothing this message could quote. '
            + 'That is a content problem to fix at the source, not a gate to loosen.'
          : 'The knowledge base could not be read for this generation, so this copy cites nothing.'}
      </div>
    );
  }

  return (
    <ol className="small mb-0 ps-3" data-testid="sources-list">
      {m.cited.map((c, i) => (
        <li key={`${c.domain}-${i}`} className="mb-1">
          <span className="text-muted">{c.domain}</span> &mdash; {c.question}
          {c.reference !== '' && (
            <>
              {' '}
              <a
                href={`/knowledge/${c.reference}`}
                target="_blank"
                rel="noreferrer"
                className="text-decoration-none"
              >
                {c.referenceLabel || 'source'}
              </a>
            </>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Who the copy was written as, and whether a published voice governed it. */
export function BrandVoiceBadge({ m }: { m: ExplorerWhyMessage }) {
  if (!m.brand_voice) {
    // Pre-dates brand voice being recorded. Said, not hidden.
    return (
      <span className="badge bg-light text-dark border" data-testid="voice-unrecorded">
        Brand voice not recorded
      </span>
    );
  }

  return (
    <>
      <span className="text-muted small" data-testid="voice-name">
        Written as {m.brand_voice.name}
      </span>
      {m.brand_voice.published ? (
        <span className="badge bg-light text-dark border" data-testid="voice-published">
          Voice v{m.brand_voice.rules_version}
        </span>
      ) : (
        /* A STATED NEGATIVE. Version 0 is "nobody has written a voice down for this
           brand", which must not read as "this brand's voice says nothing". */
        <span className="badge bg-warning text-dark" data-testid="voice-ungoverned">
          No published voice
        </span>
      )}
    </>
  );
}

/**
 * Ask for another attempt, with an optional brief.
 *
 * The four-state machine and the report-the-run discipline are `ContentRefreshButton`'s,
 * reused rather than re-derived: it never says "Done", it names what happened, and it
 * special-cases the 403 so a dark feature does not read as a broken button.
 */
export function RegenerateControl({
  decisionId,
  onDone,
}: {
  decisionId: string;
  onDone: () => void;
}) {
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [note, setNote] = useState('');
  const [brief, setBrief] = useState('');

  async function run() {
    setState('running');
    setNote('');
    try {
      const r = await regenerateDraft(decisionId, brief.trim() ? { brief: brief.trim() } : {});

      // Reported, never "Done". A refused regeneration is the gate working, and a reviewer
      // needs to know THAT happened rather than that the request succeeded.
      if (r.status === 'rejected') {
        setNote(
          `A new version was written and the quality gate refused it${
            r.issues.length > 0 ? `: ${r.issues.join('; ')}` : '.'
          }`,
        );
      } else if (r.status === 'drafted') {
        setNote(
          r.superseded_scheduled_email_id
            ? 'A new version was written and the previous one was kept.'
            : 'A new version was written. Nothing was superseded, so another revision may have landed first.',
        );
      } else {
        setNote(`Nothing was written: ${r.reason ?? r.status}.`);
      }

      setState('done');
      setBrief('');
      onDone();
    } catch (e: unknown) {
      const err = e as { response?: { status?: number; data?: { error?: string } } };
      if (err.response?.status === 403) {
        setNote('The draft render is switched off. Turn its flag on before regenerating.');
      } else if (err.response?.status === 409) {
        setNote(
          'This decision has never been drafted, so there is no version to replace. '
          + 'Re-run the draft render instead.',
        );
      } else {
        setNote(
          err.response?.data?.error
            ?? 'The regeneration failed. The previous draft is unchanged.',
        );
      }
      setState('error');
    }
  }

  return (
    <div className="border rounded p-3 mb-3">
      <label className="form-label small fw-medium" htmlFor="regen-brief">
        Ask for a revision
      </label>
      <textarea
        id="regen-brief"
        className="form-control form-control-sm mb-2"
        rows={2}
        maxLength={500}
        value={brief}
        onChange={(e) => setBrief(e.target.value)}
        placeholder="Optional. For example: shorter, and lead with the cohort date."
        disabled={state === 'running'}
      />
      <div className="form-text mb-2">
        The brief is added to the existing instructions, not a replacement for them. Leave it
        empty to try again unchanged.
      </div>
      <button
        type="button"
        className="btn btn-sm btn-outline-primary"
        onClick={run}
        disabled={state === 'running'}
        data-testid="regenerate-draft"
      >
        {state === 'running' ? (
          <>
            <span className="spinner-border spinner-border-sm me-2" role="status" />
            Writing a new version&hellip;
          </>
        ) : (
          <>
            <i className="ri-sparkling-line me-1" />
            Write another version
          </>
        )}
      </button>
      {note !== '' && (
        <div
          role="status"
          className={`small mt-2 ${state === 'error' ? 'text-danger' : 'text-muted'}`}
        >
          {note}
        </div>
      )}
    </div>
  );
}

/** The versions of this draft, newest first, with a diff of the newest against the one before. */
function VersionHistory({ decisionId }: { decisionId: string }) {
  const history = useExplorerData(() => getDraftHistory(decisionId), `history:${decisionId}`);

  return (
    <AsyncPanel state={history} onRetry={history.reload}>
      {(data: { versions: ExplorerDraftVersion[] }) => {
        const versions = data.versions;
        if (versions.length < 2) {
          return (
            <div className="text-muted small" data-testid="history-single">
              {versions.length === 0
                ? 'No version has been rendered for this decision.'
                : 'This is the first version, so there is nothing to compare it against.'}
            </div>
          );
        }

        // Oldest first on the wire; the two that matter are the last two.
        const current = versions[versions.length - 1];
        const previous = versions[versions.length - 2];
        const lines = diffLines(draftBodyToText(previous.body), draftBodyToText(current.body));

        return (
          <div data-testid="history-diff">
            <div className="small text-muted mb-2">
              {versions.length} versions. Comparing v{previous.version} with v{current.version}.
            </div>

            {previous.subject !== current.subject && (
              <div className="small mb-2" data-testid="subject-changed">
                <span className="text-muted">Subject:</span>{' '}
                <del className="text-danger">{previous.subject}</del>{' '}
                <ins className="text-success text-decoration-none">{current.subject}</ins>
              </div>
            )}

            {!hasChanges(lines) ? (
              <div className="text-muted small" data-testid="diff-identical">
                The body is identical to the previous version. Generation is not
                deterministic, so this can happen on a revision with no brief.
              </div>
            ) : (
              <pre
                className="small mb-0 p-2 bg-light border rounded"
                style={{ whiteSpace: 'pre-wrap' }}
              >
                {lines.map((l, i) => (
                  <div
                    key={i}
                    className={
                      l.kind === 'added'
                        ? 'text-success'
                        : l.kind === 'removed'
                          ? 'text-danger'
                          : 'text-body'
                    }
                  >
                    {l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '- ' : '  '}
                    {l.text}
                  </div>
                ))}
              </pre>
            )}
          </div>
        );
      }}
    </AsyncPanel>
  );
}

/**
 * The whole revision surface, mounted under the message.
 *
 * `onDone` is the Why payload's own reload, injected the way `ContentTab` injects
 * `health.reload` into its refresh button — so after a regeneration the message, its
 * citations and its verdict all come from one re-read rather than from a response shape
 * that would have to be kept in step with the reader.
 */
export default function DraftRevisionPanel({
  decisionId,
  onDone,
}: {
  decisionId: string;
  onDone: () => void;
}) {
  return (
    <div className="mt-3">
      <RegenerateControl decisionId={decisionId} onDone={onDone} />
      <h6 className="text-uppercase text-muted small fw-semibold">Versions</h6>
      <VersionHistory decisionId={decisionId} />
    </div>
  );
}
