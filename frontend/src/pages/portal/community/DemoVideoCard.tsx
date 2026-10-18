import React, { useState } from 'react';

/**
 * A DEMO IN THE FEED, THAT PLAYS.
 *
 * Publishing a demo has produced a `community_posts` row since Phase 6, and the
 * feed rendered it as body text with a "demo_video" chip — the author was told
 * their demo was shared with the cohort, and not one person could press play.
 *
 * CLICK TO PLAY, NOT AUTOPLAY. A feed that starts several videos as you scroll is
 * hostile on a phone and on a metered connection, and a rehearsal is somebody
 * speaking — sound starting unbidden is worse here than on a muted clip.
 *
 * THE STILL IS A FRAME OF THE RECORDING ITSELF, via `preload="metadata"` and a
 * `#t=` media fragment, which makes the browser paint the frame at that offset
 * without downloading the whole file. There is no stored thumbnail because the
 * backend image has no ffmpeg, and adding it is an infrastructure change rather
 * than something to slip into a feature branch. The trade is honest and worth
 * naming: this costs a metadata request per card, and a stored still would not.
 *
 * ONE SECOND IN, not zero: the first frame of a screen share is very often a blank
 * desktop or a dialog mid-fade, and a wall of grey rectangles tells a viewer
 * nothing about which demo is which.
 *
 * THE URL IS NOT REBUILT HERE. It arrives signed, minted for this viewer, and the
 * server decided they may watch — a card that constructed its own URL would be
 * asserting an access decision it is not entitled to make.
 */

export interface DemoVideoCardProps {
  playbackUrl: string;
  durationSeconds: number | null;
  viewLabel: string;
  /** The author's own words. Shown above the player, as the post body already is. */
  summary?: string | null;
}

const mmss = (s: number | null): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const DemoVideoCard: React.FC<DemoVideoCardProps> = ({ playbackUrl, durationSeconds, viewLabel }) => {
  const [playing, setPlaying] = useState(false);
  const length = mmss(durationSeconds);

  return (
    <div className="demo-card" data-testid="demo-video-card" style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <video
          data-testid="demo-video-player"
          controls={playing}
          autoPlay={playing}
          preload="metadata"
          playsInline
          style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'contain' }}
          // The fragment is what paints a still without a stored thumbnail. Dropping
          // it leaves most browsers showing a black rectangle.
          src={playing ? playbackUrl : `${playbackUrl}#t=1`}
        >
          <a href={playbackUrl}>Open this demo</a>
        </video>

        {!playing && (
          <button
            type="button"
            data-testid="demo-video-play"
            aria-label="Play this demo"
            onClick={() => setPlaying(true)}
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', border: 0, cursor: 'pointer',
              background: 'rgba(0,0,0,0.28)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 56, height: 56, borderRadius: '50%', background: 'rgba(255,255,255,0.94)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, color: '#111', paddingLeft: 4,
              }}
            >
              ▶
            </span>
          </button>
        )}

        {!playing && length && (
          <span
            data-testid="demo-video-duration"
            style={{
              position: 'absolute', right: 8, bottom: 8, padding: '2px 6px',
              borderRadius: 4, background: 'rgba(0,0,0,0.72)', color: '#fff', fontSize: 12,
            }}
          >
            {length}
          </span>
        )}
      </div>

      <p className="rt-muted" data-testid="demo-video-views" style={{ margin: '6px 0 0', fontSize: 13 }}>
        <span aria-hidden="true">🎬 </span>Demo · {viewLabel}
      </p>
    </div>
  );
};

export default DemoVideoCard;
