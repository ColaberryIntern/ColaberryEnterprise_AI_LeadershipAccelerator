import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';

/**
 * D12 — the videographer handoff: what is owed for this airing, and what is actually there.
 *
 * ## Three states, and the one that is usually got wrong
 *
 * A checklist has two states by habit: done and not done. This has three, because the third is
 * most of the list.
 *
 * `DOC_07_YOUTUBE_MEDIA_PRODUCTION_ENGINE.md` records that nothing in this system produces a
 * transcript, chapter markers, a retention disposition, or title and thumbnail drafts - its own
 * summary is "two of fifteen outputs, and the build plan does not cover the other thirteen".
 *
 * Rendered as unticked boxes, those read as things somebody forgot, and a videographer waits
 * for a transcript that no code anywhere is going to write. So `not_built` is styled and worded
 * as a different kind of thing from `missing`, and the notice counts the two separately. One is
 * a to-do list; the other is a scope gap with a ticket number.
 *
 * ## Why it is not its own tab
 *
 * D12 asks for a new route. It lives beside the clip list instead, because that IS the editor's
 * surface - the list, the CSV button and the keep-or-cut controls are already there, and the
 * handoff reads the same airing. A separate tab would split one job across two screens and put
 * the question ("is this ready to hand over?") somewhere other than the answer.
 */

type HandoffState = 'ready' | 'missing' | 'not_built';

interface HandoffItem {
  key: string;
  label: string;
  state: HandoffState;
  detail: string;
}

interface Notice {
  warn: boolean;
  missing: number;
  notBuilt: number;
  text: string;
}

interface HandoffResponse {
  aired: boolean;
  post_show?: HandoffItem[];
  package?: HandoffItem[];
  notice?: Notice | null;
  post_show_notice?: Notice | null;
}

interface Props {
  sessionId: string;
  /** Injected in tests. Defaults to the real admin request. */
  load?: (sessionId: string) => Promise<HandoffResponse>;
}

async function loadHandoff(sessionId: string): Promise<HandoffResponse> {
  const res = await api.get<HandoffResponse>(
    `/api/admin/accelerator/sessions/${sessionId}/handoff`,
  );
  return res.data;
}

/**
 * The mark beside each line.
 *
 * `not_built` gets its own glyph and its own color rather than an empty box. An empty box is a
 * promise that filling it is possible.
 */
const MARK: Record<HandoffState, { glyph: string; className: string; title: string }> = {
  ready: { glyph: '✓', className: 'text-success', title: 'Ready' },
  missing: { glyph: '○', className: 'text-warning', title: 'Missing, and fixable' },
  // A circled slash rather than a dash: it reads as "not possible here", which is what this
  // state means, and it keeps an em dash out of a new string per CLAUDE.md.
  not_built: { glyph: '⊘', className: 'text-muted', title: 'Not built in this system' },
};

function ItemList({ items, testid }: { items: HandoffItem[]; testid: string }): React.ReactElement {
  return (
    <ul className="list-unstyled mb-0" data-testid={testid}>
      {items.map((i) => (
        <li key={i.key} className="d-flex gap-2 mb-2" data-testid={`handoff-${i.key}`}>
          <span
            className={MARK[i.state].className}
            style={{ fontWeight: 700, width: 14 }}
            title={MARK[i.state].title}
            data-testid={`handoff-mark-${i.key}`}
            data-state={i.state}
            aria-label={MARK[i.state].title}
          >
            {MARK[i.state].glyph}
          </span>
          <span>
            <span style={{ fontWeight: i.state === 'ready' ? 400 : 600 }}>{i.label}</span>
            <span className="d-block text-muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
              {i.detail}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const SessionHandoff: React.FC<Props> = ({ sessionId, load }) => {
  const [data, setData] = useState<HandoffResponse | null>(null);
  const [failed, setFailed] = useState(false);

  const read = useCallback(() => (load ?? loadHandoff)(sessionId), [load, sessionId]);

  useEffect(() => {
    let alive = true;
    read()
      .then((d) => { if (alive) { setData(d); setFailed(false); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [read]);

  // Said quietly, but said: a panel that simply vanishes is indistinguishable from a class that
  // never aired, and those call for completely different next actions.
  if (failed) {
    return (
      <div className="class-kit-noprint mt-4 pt-3 border-top">
        <div className="text-muted" style={{ fontSize: 13 }}>Could not load the handoff check.</div>
      </div>
    );
  }

  if (!data || !data.aired) return null;

  const postShow = data.post_show ?? [];
  const pkg = data.package ?? [];

  return (
    <div className="class-kit-noprint mt-4 pt-3 border-top" data-testid="session-handoff">
      <h3 className="h6 mb-1">Handoff to the videographer</h3>

      {data.post_show_notice?.warn && (
        <div
          className="alert alert-warning py-2 px-3 mb-3"
          style={{ fontSize: 13 }}
          role="status"
          data-testid="handoff-post-show-notice"
        >
          <b>Before anyone goes home:</b> {data.post_show_notice.text}
        </div>
      )}

      <div className="text-muted mb-2" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em' }}>
        POST-SHOW CHECK
      </div>
      <ItemList items={postShow} testid="handoff-post-show" />

      <div
        className="text-muted mt-3 mb-2"
        style={{ fontSize: 12, fontWeight: 600, letterSpacing: '.04em' }}
      >
        THE PACKAGE
      </div>
      <ItemList items={pkg} testid="handoff-package" />

      {data.notice?.warn && (
        <div className="mt-2" style={{ fontSize: 12 }} data-testid="handoff-notice">
          <span className="text-muted">{data.notice.text}</span>
        </div>
      )}
    </div>
  );
};

export default SessionHandoff;
