import React, { useRef, useState } from 'react';
import { createPost } from '../../../services/communityApi';
import type { BoardResponse, PostLane } from '../board/boardData';
import BoardComposer, { laneForType, MIN_WORDS, serverWords, type ComposeType } from '../board/BoardComposer';
import { initials } from '../board/boardTime';

/**
 * Colaberry Now's composer (Campus v20 N2, Basecamp C133; the prototype's .nComp): an avatar, one line ("Share something, ask a
 * question, or comment on what's playing…"), a kind select (💬 Post / ❓ Question / this week's ritual) and Post. It posts with the
 * v14 rules: the feed's 15-word minimum is enforced by the server and its words are shown exactly as sent, and one post is in flight
 * at a time. The ritual kind needs its guided fields, so it opens the v14 ritual composer right under the line.
 */
export default function NowComposer({ me, initial = 'post', weekRitual, onPosted }: {
  me: string; initial?: ComposeType; weekRitual: BoardResponse['week_ritual']; onPosted: (lane: PostLane) => void;
}): React.ReactElement {
  const [kind, setKind] = useState<ComposeType>(initial);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const ritual = weekRitual?.ritual ?? null;

  const post = async () => {
    const text = body.trim();
    if (inFlight.current || !text) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      await createPost({ body: text, category: kind === 'q' ? 'Support' : 'General' });
      setBody('');
      onPosted(laneForType(kind));
    } catch (e) {
      setMessage(serverWords(e));
    } finally { inFlight.current = false; setBusy(false); }
  };
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="cn-compose-wrap">
      <form className="cn-compose" onSubmit={(e) => { e.preventDefault(); void post(); }} data-testid="cn-compose">
        <span className="cn-av" aria-hidden="true">{me ? initials(me) : 'You'}</span>
        {kind === 'ritual' && ritual
          ? <span className="cn-compose-ritual">{ritual.icon} {ritual.name}: {ritual.ask}</span>
          : <input value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} data-testid="cn-compose-input"
            placeholder="Share something, ask a question, or comment on what’s playing…" aria-label="Share something with everyone on campus" />}
        <select value={kind} onChange={(e) => { setKind(e.target.value as ComposeType); setMessage(''); }} aria-label="What kind of post" data-testid="cn-compose-kind">
          <option value="post">💬 Post</option>
          <option value="q">❓ Question</option>
          {ritual && <option value="ritual">{ritual.icon} {ritual.name}</option>}
        </select>
        {kind !== 'ritual' && <button type="submit" className="cn-post-btn" disabled={busy || !words} data-testid="cn-compose-post">{busy ? 'Posting…' : 'Post'}</button>}
      </form>
      {kind !== 'ritual' && words > 0 && words < MIN_WORDS && !message && (
        <small className="cn-hint" data-testid="cn-words">{words} {words === 1 ? 'word' : 'words'} · posts need at least {MIN_WORDS}</small>
      )}
      {message && <p className="cn-msg" role="alert" data-testid="cn-compose-error">{message}</p>}
      {kind === 'ritual' && ritual && (
        <div className="cb2 cn-ritual"><BoardComposer initial="ritual" weekRitual={weekRitual} onCancel={() => setKind('post')} onPosted={(lane) => { setKind('post'); onPosted(lane); }} /></div>
      )}
    </div>
  );
}
