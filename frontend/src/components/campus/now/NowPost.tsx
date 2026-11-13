import React from 'react';
import type { BoardPost } from '../board/boardData';
import { ageLabel, firstName, fullCentral, initials } from '../board/boardTime';
import { isUnansweredQuestion, sectionOf } from './nowModel';

/**
 * One post in the Colaberry Now stream (Campus v20 N2, Basecamp C133; the prototype's .nPost): avatar, first name, the section chip,
 * its age, NEW, the title, a two-line excerpt, the ritual's reaction count and the replies ("· answer it" on an unanswered question,
 * "n new replies" on yours). Pinned announcements get a teal edge and "📌 pinned". The whole row opens the thread.
 */
export default function NowPost({ p, now, isNew, glow, onOpen }: {
  p: BoardPost; now: number; isNew: boolean; glow: boolean; onOpen: (p: BoardPost) => void;
}): React.ReactElement {
  const sec = sectionOf(p);
  const reaction = p.ritual?.reaction.emoji ?? '👍';
  const cls = ['cn-post', p.pinned && 'pinned', p.mine && 'mine', glow && 'glow'].filter(Boolean).join(' ');
  return (
    <button type="button" className={cls} onClick={() => onOpen(p)} data-testid="cn-post" data-id={p.id}>
      <span className="cn-av" aria-hidden="true">{initials(p.member.display_name)}</span>
      <span className="cn-bd">
        <span className="cn-ph">
          <b>{firstName(p.member.display_name)}</b>
          <span className="cn-sec" data-lane={p.pinned ? 'ann' : p.lane}><span aria-hidden="true">{sec.icon}</span> {sec.label.toUpperCase()}</span>
          <time dateTime={p.created_at} title={fullCentral(p.created_at)}>{ageLabel(p.created_at, now)}</time>
          {p.pinned && <span className="cn-pin">· 📌 pinned</span>}
        </span>
        <span className="cn-h">{p.title}</span>
        {p.excerpt && <span className="cn-ex">{p.excerpt}</span>}
        <span className="cn-ft">
          <span aria-label={`${p.like_count} reactions`}>{reaction} {p.like_count}</span>
          <span className={isUnansweredQuestion(p) ? 'q' : ''}>💬 {p.comment_count}{isUnansweredQuestion(p) ? ' · answer it' : ''}</span>
          {p.mine && p.new_replies > 0 && <span className="cn-nr" data-testid="cn-new-replies">{p.new_replies} new {p.new_replies === 1 ? 'reply' : 'replies'}</span>}
        </span>
      </span>
      {isNew && <span className="cn-nw" data-testid="cn-new">NEW</span>}
    </button>
  );
}
