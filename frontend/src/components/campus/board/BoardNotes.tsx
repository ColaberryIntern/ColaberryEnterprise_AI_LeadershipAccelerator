import React from 'react';
import type { BoardPost } from './boardData';
import { ageLabel, firstName, fullCentral, initials, laneMeta, tiltOf, whereNow } from './boardTime';

/**
 * The board's pieces of paper (Campus v14 B2, Basecamp C67), drawn as the prototype draws them (docs/design/campus/colaberry-campus-v14.html
 * .cb-note / .cb-row / .cb-q / .cb-pinned / .cb-mine): every one is a button that opens the thread drawer, shows an age with the full
 * Central time in its tooltip, and carries its lane colour (data-lane, mapped to art tokens in communityBoard.css). Only real fields.
 */
export function Age({ iso, now }: { iso: string; now: number }): React.ReactElement {
  return <time className="cb-age" dateTime={iso} title={fullCentral(iso)}>{ageLabel(iso, now)}</time>;
}

export function Avatar({ p, size = 'sm' }: { p: BoardPost['member']; size?: 'sm' | 'md' }): React.ReactElement {
  return p.avatar_url
    ? <img className={`cb-av ${size}`} src={p.avatar_url} alt="" />
    : <span className={`cb-av ${size}`} aria-hidden="true">{initials(p.display_name)}</span>;
}

export function Chip({ p }: { p: BoardPost }): React.ReactElement {
  const icon = p.ritual?.icon ?? laneMeta(p.lane).icon;
  const name = p.ritual?.name ?? (p.lane === 'q' ? 'Question' : p.lane === 'ann' ? 'Announcement' : 'Post');
  return <span className="cb-chip"><span aria-hidden="true">{icon}</span>{name}</span>;
}

const counts = (p: BoardPost): React.ReactElement => (
  <span className="ct">
    <span title={p.ritual?.reaction.label ?? 'Likes'}>{p.ritual?.reaction.emoji ?? '👍'} {p.like_count}</span>
    <span title="Replies">💬 {p.comment_count}</span>
  </span>
);

export interface NoteProps { p: BoardPost; now: number; isNew: boolean; glow?: boolean; onOpen: (p: BoardPost) => void }

export function NoteCard({ p, now, isNew, glow, onOpen }: NoteProps): React.ReactElement {
  return (
    <button type="button" className={`cb-note${p.mine ? ' mine' : ''}${glow ? ' glow' : ''}`} data-lane={p.lane} style={{ ['--r' as string]: `${tiltOf(p.id)}deg` }}
      onClick={() => onOpen(p)} data-testid={`cb-note-${p.id}`} aria-label={`${p.title}, by ${firstName(p.member.display_name)}, ${ageLabel(p.created_at, now)}`}>
      <span className="band" aria-hidden="true" />
      {isNew && <span className="cb-new">NEW</span>}
      <span className="in">
        <Chip p={p} />
        <span className="h5">{p.title}</span>
        {p.excerpt && <span className="p">{p.excerpt}</span>}
      </span>
      <span className="cb-foot">
        <Avatar p={p.member} />
        <span className="who"><b>{firstName(p.member.display_name)}</b> · <Age iso={p.created_at} now={now} /></span>
        {counts(p)}
      </span>
    </button>
  );
}

export function NoteRow({ p, now, onOpen }: Omit<NoteProps, 'isNew'>): React.ReactElement {
  return (
    <button type="button" className="cb-row" data-lane={p.lane} onClick={() => onOpen(p)} data-testid={`cb-row-${p.id}`}>
      <span className="ic" aria-hidden="true">{p.ritual?.icon ?? laneMeta(p.lane).icon}</span>
      <span className="tx">
        <b>{p.title}</b>
        <small>{p.ritual?.name ?? laneMeta(p.lane).label} · {firstName(p.member.display_name)} · <Age iso={p.created_at} now={now} /></small>
      </span>
      {counts(p)}
    </button>
  );
}

export function QuestionCard({ p, now, onOpen }: Omit<NoteProps, 'isNew'>): React.ReactElement {
  return (
    <button type="button" className="cb-q" onClick={() => onOpen(p)} data-testid={`cb-q-${p.id}`}>
      <Chip p={p} />
      <b>{p.title}</b>
      <span className="m"><Avatar p={p.member} /> {firstName(p.member.display_name)} · <Age iso={p.created_at} now={now} /></span>
      <span className="btn">Answer →</span>
    </button>
  );
}

export function PinnedRibbon({ p, now, onOpen }: Omit<NoteProps, 'isNew'>): React.ReactElement {
  return (
    <button type="button" className="cb-pinned" onClick={() => onOpen(p)} data-testid={`cb-pinned-${p.id}`}>
      <span aria-hidden="true">📣</span>
      <span className="tx"><b>{p.title}</b><small>Pinned by {firstName(p.member.display_name)} · <Age iso={p.created_at} now={now} /></small></span>
      <span className="go">Read →</span>
    </button>
  );
}

export function MineCard({ p, now, glow, onOpen }: Omit<NoteProps, 'isNew'>): React.ReactElement {
  return (
    <button type="button" className={`cb-mine${glow ? ' glow' : ''}`} data-lane={p.lane} onClick={() => onOpen(p)} data-testid={`cb-mine-${p.id}`}>
      <span className="top"><Chip p={p} /> <Age iso={p.created_at} now={now} /></span>
      <span className="st">
        <span>{p.ritual?.reaction.emoji ?? '👍'} {p.like_count}</span>
        <span>💬 {p.comment_count}{p.new_replies > 0 && <span className="hot" data-testid={`cb-mine-new-${p.id}`}> · {p.new_replies} new</span>}</span>
      </span>
      <b>{p.title}</b>
      <span className="where">{whereNow(p, now)}</span>
    </button>
  );
}
