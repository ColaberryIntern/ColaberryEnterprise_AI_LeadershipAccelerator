import React from 'react';
import { BOOK_CALL_PATH, hasBookCallHost, openBookCall } from '../../../components/campus/admissions/admissionsCallApi';
import { TOUR_PATH, hasTourHost, requestTour } from '../../../components/campus/tourLink';

/**
 * A DM message's text, as plain text, with TWO exceptions, both Maya's:
 *   C122 her booking link, `[label](/portal/campus?book=call)`: with a booking-sheet host on the page it opens the sheet in place;
 *        without one it navigates to the campus, whose host opens the sheet from the URL.
 *   C123 her tour link, `[label](/portal/campus?tour=start)`: on the campus home it starts the guided tour in place; elsewhere it
 *        navigates to the campus, which starts the tour from the URL once the learner is past the daily gate.
 *
 * Only those exact paths are ever turned into links (an allowlist of two), so no message can render an arbitrary URL, script or
 * markup: everything else stays a React text node. The link sits inline with its sentence (C123: it used to break the line).
 */
interface DmAction { path: string; icon: string; testId: string; inPlace: () => boolean; run: () => void }
const ACTIONS: DmAction[] = [
  { path: BOOK_CALL_PATH, icon: '📅', testId: 'dm-book-call', inPlace: hasBookCallHost, run: () => openBookCall() },
  { path: TOUR_PATH, icon: '🧭', testId: 'dm-tour', inPlace: hasTourHost, run: requestTour },
];
const LINK_SOURCE = '\\[([^\\]\\n]{1,80})\\]\\((/portal/campus\\?(?:book=call|tour=start))\\)';

export default function DmMessageText({ content }: { content: string }): React.ReactElement {
  const parts: React.ReactNode[] = [];
  const re = new RegExp(LINK_SOURCE, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const at = m.index;
    const action = ACTIONS.find((a) => a.path === m![2]);
    if (!action) continue;
    if (at > last) parts.push(content.slice(last, at));
    parts.push(
      <a key={at} href={action.path} className="te-dm-action" data-testid={action.testId}
        onClick={(e) => { if (action.inPlace()) { e.preventDefault(); action.run(); } }}>
        <span aria-hidden="true">{action.icon} </span>{m[1]}
      </a>,
    );
    last = at + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <>{parts}</>;
}
