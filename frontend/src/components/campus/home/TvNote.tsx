import React, { useState } from 'react';
import { openBoard } from '../board/boardApi';
import { dismissTvNote, tvNoteFor } from '../now/tvNote';
import { thumbOf } from '../now/tvPlaylist';
import { useTvPeek } from '../now/useTvPeek';

/**
 * "📺 New on Colaberry TV" in the left panel (Campus v20 N4, Basecamp C135; the prototype's .tvnudge): the newest short's thumbnail,
 * how many are new, and ✕. Pressing it opens Colaberry Now (with the walk, as every other opener does); ✕ hides it for the day. It
 * shows nothing when there is nothing new, and it never plays anything (the thumbnail is a still image).
 */
export default function TvNote(): React.ReactElement | null {
  const shorts = useTvPeek();
  const [hidden, setHidden] = useState(false);
  const { show, fresh } = tvNoteFor(shorts);
  if (hidden || !show) return null;
  return (
    <div className="cm-tvnote" data-testid="cm-tvnote">
      <button type="button" className="cm-tvnote-go" onClick={() => { setHidden(true); openBoard({ walk: true }); }} aria-label={`New on Colaberry TV: ${fresh.length} new. Open Colaberry Now`}>
        <span className="cm-tvnote-th"><img src={thumbOf(fresh[0].youtube_id)} alt="" loading="lazy" /><i aria-hidden="true">▶</i></span>
        <span className="cm-tvnote-tx"><b>📺 New on Colaberry TV</b><small>{fresh.length} new · on Colaberry Now</small></span>
      </button>
      <button type="button" className="cm-tvnote-x" onClick={() => { dismissTvNote(); setHidden(true); }} aria-label="Hide for today" data-testid="cm-tvnote-x">✕</button>
    </div>
  );
}
