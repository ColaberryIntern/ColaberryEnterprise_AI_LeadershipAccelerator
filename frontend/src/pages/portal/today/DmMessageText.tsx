import React from 'react';
import { BOOK_CALL_PATH, hasBookCallHost, openBookCall } from '../../../components/campus/admissions/admissionsCallApi';

/**
 * A DM message's text, as plain text, with ONE exception (C122): Maya's booking link, `[label](/portal/campus?book=call)`,
 * becomes a button-like link. With a booking-sheet host on the page it opens the sheet in place; without one it navigates
 * to the campus, whose host opens the sheet from the URL. Bookings then land through the campus admissions-call route on the
 * admissions calendar and show in "Coming up".
 *
 * Only that exact path is ever turned into a link (an allowlist of one), so no message can render an arbitrary URL, script
 * or markup: everything else stays a React text node.
 */
const LINK_SOURCE = '\\[([^\\]\\n]{1,80})\\]\\((/portal/campus\\?book=call)\\)';

export default function DmMessageText({ content }: { content: string }): React.ReactElement {
  const parts: React.ReactNode[] = [];
  const re = new RegExp(LINK_SOURCE, 'g');
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    const at = m.index;
    if (m[2] !== BOOK_CALL_PATH) continue;
    if (at > last) parts.push(content.slice(last, at));
    parts.push(
      <a key={at} href={BOOK_CALL_PATH} className="te-dm-action" data-testid="dm-book-call"
        onClick={(e) => { if (hasBookCallHost()) { e.preventDefault(); openBookCall(); } }}>
        <span aria-hidden="true">📅 </span>{m[1]}
      </a>,
    );
    last = at + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <>{parts}</>;
}
