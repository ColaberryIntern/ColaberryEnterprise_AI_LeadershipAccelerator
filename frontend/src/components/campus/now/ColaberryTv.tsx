import React, { useCallback, useEffect, useRef, useState } from 'react';
import { follow, mmss, nextIndex, prevIndex, readMuted, saveMuted, thumbOf, type TvShort } from './tvPlaylist';
import { useTvChannel } from './useTvChannel';

/**
 * Colaberry TV, the left column of Colaberry Now (Campus v20 N2, Basecamp C132; the prototype's .nTV in
 * docs/design/campus/colaberry-campus-v20.html). Always on while Colaberry Now is open: the shorts play one after another and loop.
 *
 * Header "● COLABERRY TV · ALWAYS ON" and "i OF n · LOOPS"; a 9:16 player; the title and "m:ss · the next one plays by itself" (the
 * length only once the player has reported it); ▲ ▼, 🔊/🔇, and ⚙ Manage TV for staff with Campaigns; a reel of every on-air short
 * down the right edge, the current one outlined. `restart` (a counter) jumps back to the first short (the Happening-now chip).
 * When the playlist changes underneath it, the playing short keeps playing if it is still on air, else the TV moves on (follow).
 */
const lengths = new Map<string, number>(); // lengths the player reported this visit, by YouTube id

export default function ColaberryTv({ videos, canManage, onManage, restart = 0 }: {
  videos: TvShort[]; canManage: boolean; onManage: () => void; restart?: number;
}): React.ReactElement {
  const [index, setIndex] = useState(0);
  const [, setTick] = useState(0);
  const prev = useRef<TvShort[]>(videos);
  const currentId = useRef<string | null>(videos[0]?.id ?? null);

  useEffect(() => {
    const f = follow(prev.current, videos, currentId.current);
    prev.current = videos;
    setIndex(f.index);
  }, [videos]);
  useEffect(() => { if (restart) setIndex(0); }, [restart]);

  const n = videos.length;
  const i = n ? Math.min(index, n - 1) : 0;
  const cur = n ? videos[i] : null;
  currentId.current = cur?.id ?? null;

  const next = useCallback(() => setIndex((x) => nextIndex(x, n)), [n]);
  const back = useCallback(() => setIndex((x) => prevIndex(x, n)), [n]);
  const tv = useTvChannel(cur?.youtube_id ?? null, {
    startMuted: readMuted(),
    onEnded: next,
    onDuration: (id, s) => { if (lengths.get(id) !== Math.round(s)) { lengths.set(id, Math.round(s)); setTick((t) => t + 1); } },
    onMutedChange: saveMuted,
  });
  const lengthOf = (s: TvShort): string => mmss(s.duration_s ?? lengths.get(s.youtube_id) ?? null);

  return (
    <section className="cn-tv" aria-label="Colaberry TV" data-testid="cn-tv">
      <div className="cn-tv-hdr">
        <span className="cn-livedot" aria-hidden="true" /> COLABERRY TV · ALWAYS ON
        {n > 0 && <span className="cn-tv-count" data-testid="cn-tv-count">{i + 1} OF {n} · LOOPS</span>}
      </div>
      {cur ? (
        <>
          <div className="cn-tv-vid">
            <iframe
              key={`${cur.id}-${tv.src.includes('mute=1') ? 'm' : 's'}`}
              ref={tv.frameRef}
              src={tv.src}
              onLoad={tv.onLoad}
              title={`Colaberry TV: ${cur.title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              data-testid="cn-tv-frame"
            />
            {tv.needsTap && (
              <button type="button" className="cn-tv-tap" onClick={tv.tapForSound} data-testid="cn-tv-tap">🔊 Tap for sound</button>
            )}
          </div>
          <div className="cn-tv-cap">
            <b data-testid="cn-tv-title">{cur.title}</b>
            <small>{lengthOf(cur) ? `${lengthOf(cur)} · ` : ''}the next one plays by itself</small>
          </div>
          <div className="cn-tv-ctl">
            <button type="button" onClick={back} aria-label="Previous short" data-testid="cn-tv-prev">▲</button>
            <button type="button" onClick={next} aria-label="Next short" data-testid="cn-tv-next">▼</button>
            <button type="button" className={tv.muted ? '' : 'on'} onClick={() => tv.setMuted(!tv.muted)} aria-pressed={!tv.muted}
              aria-label={tv.muted ? 'Turn the sound on' : 'Mute'} data-testid="cn-tv-mute">{tv.muted ? '🔇' : '🔊'}</button>
            {canManage && <button type="button" className="cn-tv-mg" onClick={onManage} data-testid="cn-tv-manage">⚙ Manage TV</button>}
          </div>
          <div className="cn-tv-reel" aria-label="Every short on Colaberry TV">
            {videos.map((s, k) => (
              <button key={s.id} type="button" className={k === i ? 'on' : ''} aria-current={k === i ? 'true' : undefined}
                onClick={() => setIndex(k)} aria-label={`Play ${s.title}`} data-testid="cn-tv-reel-item">
                <img src={thumbOf(s.youtube_id)} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.visibility = 'hidden'; }} />
                {lengthOf(s) && <i>{lengthOf(s)}</i>}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="cn-tv-empty" data-testid="cn-tv-empty">
          Nothing is on Colaberry TV right now.
          {canManage && <> <button type="button" className="cn-tv-mg" onClick={onManage} data-testid="cn-tv-manage">⚙ Manage TV</button></>}
        </p>
      )}
    </section>
  );
}

/** Tests only. */
export function __resetTvLengthsForTests(): void { lengths.clear(); }
