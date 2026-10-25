import React, { useEffect, useState } from 'react';
import { runtimeApi, type RtNote } from '../../../pages/portal/runtime/runtimeApi';

/**
 * The left monitor for a lesson (round 3 §2.3 "notebook", the prototype's .notebook): lined paper that saves through the existing
 * notebook API (POST /api/portal/runtime/notebook, one note per save, tied to this card). Your earlier notes on this card are
 * listed under the page. Fails soft: a notebook that cannot load still lets you write, and a failed save keeps your text.
 */
type Status = 'idle' | 'saving' | 'saved' | 'error';

export default function LessonNotebook({ cardId }: { cardId: string }): React.ReactElement {
  const [notes, setNotes] = useState<RtNote[]>([]);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  useEffect(() => {
    let alive = true;
    setNotes([]);
    runtimeApi.notes()
      .then((all) => { if (alive) setNotes(all.filter((n) => n.card_id === cardId && n.body)); })
      .catch(() => { /* the notebook still works for writing; earlier notes just are not shown */ });
    return () => { alive = false; };
  }, [cardId]);

  const save = async () => {
    const body = draft.trim();
    if (!body) return;
    setStatus('saving');
    try {
      const note = await runtimeApi.saveNote(cardId, body);
      setNotes((n) => [note, ...n]);
      setDraft('');
      setStatus('saved');
    } catch { setStatus('error'); }
  };

  return (
    <div className="cm-ws-nb" data-testid="cm-ws-notebook">
      <h4>MY NOTES</h4>
      <textarea
        aria-label="My notes for this card"
        value={draft}
        onChange={(e) => { setDraft(e.target.value); if (status !== 'saving') setStatus('idle'); }}
        placeholder="Write your takeaway as you go…"
      />
      <div className="nb-f">
        <button type="button" className="rt-btn pri" onClick={save} disabled={!draft.trim() || status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Save note'}
        </button>
        <span role="status">{status === 'saved' ? 'Saved to your notebook' : status === 'error' ? 'Could not save. Your text is still here.' : `${notes.length} saved on this card`}</span>
      </div>
      {notes.length > 0 && (
        <ul className="nb-list" aria-label="Saved notes on this card">
          {notes.slice(0, 5).map((n) => <li key={n.id}>{n.body}</li>)}
        </ul>
      )}
    </div>
  );
}
