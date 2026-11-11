import React from 'react';
import type { Lane } from '../board/boardData';
import { LANE_META } from '../board/boardTime';
import type { StreamResponse } from './nowApi';

/**
 * The section chips (Campus v20 N2, Basecamp C133; the prototype's .nF): the v14 lanes with their names and counts, Questions
 * "n open", Your notes "n new", and a red dot on a section with posts new since your last look.
 */
export default function NowLaneChips({ head, lane, onLane }: { head: StreamResponse | null; lane: Lane; onLane: (l: Lane) => void }): React.ReactElement {
  const countOf = (k: Lane): string => {
    if (!head) return '';
    // as the prototype reads them: "Questions 3 open", "Your notes 2 new"; the plain count when nothing is open or new
    if (k === 'q') return head.open_questions > 0 ? `${head.open_questions} open` : String(head.counts.q);
    if (k === 'mine') return head.my_new_replies > 0 ? `${head.my_new_replies} new` : String(head.counts.mine);
    return String(head.counts[k]);
  };
  const hasDot = (k: Lane): boolean => !!head && (k === 'mine' ? head.my_new_replies > 0 : (head.new_since.by_lane[k] ?? 0) > 0);
  return (
    <nav className="cn-f" aria-label="Sections" data-testid="cn-lanes">
      {LANE_META.map((l) => (
        <button key={l.key} type="button" className={lane === l.key ? 'on' : ''} aria-current={lane === l.key ? 'true' : undefined}
          onClick={() => onLane(l.key)} data-testid={`cn-lane-${l.key}`}>
          <span aria-hidden="true">{l.icon}</span> {l.label} <small>{countOf(l.key)}</small>
          {hasDot(l.key) && <span className="cn-dot" aria-label="new posts" data-testid={`cn-dot-${l.key}`} />}
        </button>
      ))}
    </nav>
  );
}
