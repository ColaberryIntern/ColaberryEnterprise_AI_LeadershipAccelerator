import React, { useEffect, useRef, useState } from 'react';
import { createPost } from '../../../services/communityApi';
import { postRitualAnswer, type BoardResponse } from './boardData';
import { laneMeta } from './boardTime';
import type { PostLane } from './boardData';

/**
 * Posting so it doesn't disappear (Campus v14 B4, Basecamp C69): three types. Ask a question (Support), this week's ritual (its guided
 * fields, posted with ritual_meta exactly as the ritual composer does), Share something (General). The line says where the note goes;
 * the feed's 15-word minimum is shown live for open text; server errors are shown as the server words them; one post in flight.
 */
export type ComposeType = 'q' | 'ritual' | 'post';
export const MIN_WORDS = 15;
const RITUAL_LANE: Record<string, PostLane> = {
  unblock_me: 'q', roll_call: 'intro', show_and_tell: 'wins', cohort_wins: 'wins', meet_my_team: 'wins', never_again: 'wins',
  architect_manifesto: 'wins', skill_drop: 'tips', steal_this_prompt: 'tips', teach_one_thing: 'tips', hot_take: 'ideas', war_story: 'ideas',
};
export const laneForType = (type: ComposeType, ritualKey?: string | null): PostLane =>
  type === 'q' ? 'q' : type === 'ritual' && ritualKey ? RITUAL_LANE[ritualKey] ?? 'general' : 'general';

const serverWords = (e: unknown): string => {
  const d = (e as { response?: { data?: { details?: { fieldErrors?: { body?: string[] } }; error?: string } } }).response?.data;
  return d?.details?.fieldErrors?.body?.[0] ?? d?.error ?? 'Could not post it right now. Please try again.';
};

export interface ComposerProps {
  initial: ComposeType;
  weekRitual: BoardResponse['week_ritual'];
  onPosted: (lane: PostLane) => void;
  onCancel: () => void;
}

export default function BoardComposer({ initial, weekRitual, onPosted, onCancel }: ComposerProps): React.ReactElement {
  const [type, setType] = useState<ComposeType>(initial === 'ritual' && !weekRitual ? 'post' : initial);
  const [body, setBody] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const first = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  useEffect(() => { first.current?.focus(); }, [type]);

  const ritual = weekRitual?.ritual ?? null;
  const lane = laneForType(type, ritual?.key);
  const words = body.trim() ? body.trim().split(/\s+/).length : 0;
  const ready = type === 'ritual'
    ? !!ritual && ritual.fields.filter((f) => f.required).every((f) => (values[f.key] ?? '').trim())
    : words > 0;

  const post = async () => {
    if (inFlight.current || !ready) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      if (type === 'ritual' && ritual && weekRitual) await postRitualAnswer(ritual, weekRitual.week, values, weekRitual.category);
      else await createPost({ body: body.trim(), category: type === 'q' ? 'Support' : 'General' });
      onPosted(lane);
    } catch (e) {
      setMessage(serverWords(e));
    } finally { inFlight.current = false; setBusy(false); }
  };

  return (
    <div className="cb-compose" data-testid="cb-compose">
      <div className="types" role="radiogroup" aria-label="What kind of note">
        <button type="button" role="radio" aria-checked={type === 'q'} className={type === 'q' ? 'on' : ''} onClick={() => setType('q')} data-testid="cb-type-q">❓ Ask a question</button>
        {ritual && <button type="button" role="radio" aria-checked={type === 'ritual'} className={type === 'ritual' ? 'on' : ''} onClick={() => setType('ritual')} data-testid="cb-type-ritual">{ritual.icon} This week: {ritual.name}</button>}
        <button type="button" role="radio" aria-checked={type === 'post'} className={type === 'post' ? 'on' : ''} onClick={() => setType('post')} data-testid="cb-type-post">💬 Share something</button>
      </div>
      {type === 'ritual' && ritual ? (
        <div className="fields">
          <p className="ask">{ritual.ask}</p>
          {ritual.fields.filter((f) => f.kind !== 'link').map((f, i) => (
            <label key={f.key}>
              <span>{f.label}{f.required ? ' *' : ''}</span>
              {f.kind === 'textarea' || f.kind === 'list'
                ? <textarea ref={i === 0 ? (el) => { first.current = el; } : undefined} rows={f.kind === 'list' ? 3 : 2} value={values[f.key] ?? ''} placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
                : f.kind === 'choice' && f.choices
                  ? <select value={values[f.key] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}><option value="">Choose…</option>{f.choices.map((c) => <option key={c}>{c}</option>)}</select>
                  : <input ref={i === 0 ? (el) => { first.current = el; } : undefined} value={values[f.key] ?? ''} placeholder={f.placeholder} maxLength={f.maxLength ?? 400}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />}
            </label>
          ))}
        </div>
      ) : (
        <textarea ref={(el) => { first.current = el; }} value={body} maxLength={4000} onChange={(e) => setBody(e.target.value)} data-testid="cb-compose-body"
          placeholder={type === 'q' ? 'What do you want to ask everyone?' : 'Share something with everyone on campus'} aria-label={type === 'q' ? 'Your question' : 'Your note'} />
      )}
      {message && <p className="cb-msg" role="alert">{message}</p>}
      <div className="ft">
        <small data-testid="cb-compose-where">It goes to the top of Fresh and into {laneMeta(lane).label}. You&rsquo;ll get a notification when someone replies.
          {type !== 'ritual' && <> · <span data-testid="cb-words">{words} {words === 1 ? 'word' : 'words'} · posts need at least {MIN_WORDS}</span></>}</small>
        <button type="button" className="cb-btn" onClick={onCancel}>Cancel</button>
        <button type="button" className="cb-btn pri" onClick={post} disabled={busy || !ready} data-testid="cb-compose-post">{busy ? 'Pinning…' : 'Pin it to the board'}</button>
      </div>
    </div>
  );
}
