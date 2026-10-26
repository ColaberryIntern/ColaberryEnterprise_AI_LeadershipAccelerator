import React from 'react';
import type { BoardPost, BoardResponse, Lane } from './boardData';
import { MineCard, NoteCard, NoteRow, PinnedRibbon, QuestionCard } from './BoardNotes';
import { laneMeta } from './boardTime';

/**
 * The board's middle column (Campus v14 B2, Basecamp C67): Everything (pinned ribbons, Needs an answer, Fresh as cork notes, then
 * Earlier this week / Last week as list rows and Show older), a section (its description, then the same lists, Fresh uncapped), and
 * Your notes (one card per post with where it sits now). Empty states say so in plain words.
 */
export interface ViewProps {
  lane: Lane;
  data: BoardResponse;
  now: number;
  seenAt: string | null;
  glowId: string | null;
  older: BoardPost[];
  olderCursor: string | null;
  loadingOlder: boolean;
  onOpen: (p: BoardPost) => void;
  onLane: (l: Lane) => void;
  onOlder: () => void;
}

const isNew = (p: BoardPost, seenAt: string | null): boolean => !!seenAt && !p.mine && p.created_at > seenAt;

function Lists({ data, now, older, olderCursor, loadingOlder, onOpen, onOlder }: Pick<ViewProps, 'data' | 'now' | 'older' | 'olderCursor' | 'loadingOlder' | 'onOpen' | 'onOlder'>): React.ReactElement {
  const list = (title: string, posts: BoardPost[], id: string) => posts.length > 0 && (
    <section aria-label={title}>
      <div className="cb-sec"><h4>{title}</h4><small>{posts.length} {posts.length === 1 ? 'note' : 'notes'}</small></div>
      <div className="cb-list" data-testid={id}>{posts.map((p) => <NoteRow key={p.id} p={p} now={now} onOpen={onOpen} />)}</div>
    </section>
  );
  const allOlder = [...data.older.posts, ...older];
  return (
    <>
      {list('Earlier this week', data.this_week, 'cb-this-week')}
      {list('Last week', data.last_week, 'cb-last-week')}
      {list('Older', allOlder, 'cb-older')}
      {olderCursor !== null && (
        <button type="button" className="cb-more" onClick={onOlder} disabled={loadingOlder} data-testid="cb-show-older">
          {loadingOlder ? 'Loading…' : allOlder.length ? 'Show 20 more older notes ↓' : 'Show older notes ↓'}
        </button>
      )}
    </>
  );
}

function Fresh({ posts, capped, ...p }: { posts: BoardPost[]; capped: boolean } & Pick<ViewProps, 'now' | 'seenAt' | 'glowId' | 'onOpen'>): React.ReactElement | null {
  if (!posts.length) return null;
  return (
    <section aria-label="Fresh, last 48 hours">
      <div className="cb-sec"><h4>📌 Fresh · last 48 hours</h4>{capped && <small>the newest {posts.length}</small>}</div>
      <div className="cb-grid" data-testid="cb-fresh">
        {posts.map((n) => <NoteCard key={n.id} p={n} now={p.now} isNew={isNew(n, p.seenAt)} glow={p.glowId === n.id} onOpen={p.onOpen} />)}
      </div>
    </section>
  );
}

export function Everything(v: ViewProps): React.ReactElement {
  const { data } = v;
  const empty = !data.pinned.length && !data.unanswered.length && !data.fresh.length && !data.this_week.length && !data.last_week.length;
  return (
    <>
      {data.pinned.map((p) => <PinnedRibbon key={p.id} p={p} now={v.now} onOpen={v.onOpen} />)}
      {data.unanswered.length > 0 && (
        <section aria-label="Needs an answer">
          <div className="cb-sec"><h4>🙋 Needs an answer</h4><button type="button" className="lnk" onClick={() => v.onLane('q')}>All questions →</button></div>
          <div className="cb-qs" data-testid="cb-unanswered">{data.unanswered.map((p) => <QuestionCard key={p.id} p={p} now={v.now} onOpen={v.onOpen} />)}</div>
        </section>
      )}
      <Fresh posts={data.fresh} capped={data.fresh.length >= 9} now={v.now} seenAt={v.seenAt} glowId={v.glowId} onOpen={v.onOpen} />
      {empty && <div className="cb-empty">Nothing pinned yet. Add the first note.</div>}
      <Lists {...v} />
    </>
  );
}

export function Section(v: ViewProps): React.ReactElement {
  const { data } = v;
  const meta = laneMeta(v.lane);
  const empty = !data.pinned.length && !data.fresh.length && !data.this_week.length && !data.last_week.length && !data.older.posts.length && !v.older.length;
  return (
    <>
      {meta.desc && <p className="cb-lanedesc" data-testid="cb-lanedesc">{meta.desc}</p>}
      {data.pinned.map((p) => <PinnedRibbon key={p.id} p={p} now={v.now} onOpen={v.onOpen} />)}
      <Fresh posts={data.fresh} capped={false} now={v.now} seenAt={v.seenAt} glowId={v.glowId} onOpen={v.onOpen} />
      {empty ? <div className="cb-empty" data-testid="cb-empty">Nothing here yet.</div> : <Lists {...v} />}
    </>
  );
}

export function YourNotes(v: ViewProps): React.ReactElement {
  const { data } = v;
  const mine = [...data.fresh, ...data.this_week, ...data.last_week, ...data.older.posts, ...v.older]
    .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (!mine.length) {
    return <div className="cb-empty" data-testid="cb-empty">You haven&rsquo;t posted yet. Everything you post shows up here, with replies and where it sits on the board.</div>;
  }
  return (
    <>
      <p className="cb-lanedesc">{laneMeta('mine').desc}</p>
      <div data-testid="cb-mine-list">{mine.map((p) => <MineCard key={p.id} p={p} now={v.now} glow={v.glowId === p.id} onOpen={v.onOpen} />)}</div>
      {v.olderCursor !== null && <button type="button" className="cb-more" onClick={v.onOlder} disabled={v.loadingOlder}>Show older ↓</button>}
    </>
  );
}
