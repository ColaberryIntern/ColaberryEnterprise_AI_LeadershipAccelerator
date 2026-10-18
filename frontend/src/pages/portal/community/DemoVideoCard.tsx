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
 * THE STILL IS A FRAME CHOSEN FOR HAVING SOMETHING ON IT. The server samples
 * several frames and scores each one — see `frameScore.ts` — because the frame at
 * any fixed offset is black whenever the learner had their camera off and a bare
 * desktop whenever the screen share had not started. With a poster the browser
 * fetches no video at all until play.
 *
 * THE FRAGMENT FALLBACK REMAINS for recordings with no usable frame. A camera-off
 * take is black end to end and the server correctly declines to invent a
 * thumbnail; the player then paints its own frame as it did before. A missing
 * picture must never break a working demo.
 *
 * THE URL IS NOT REBUILT HERE. It arrives signed, minted for this viewer, and the
 * server decided they may watch — a card that constructed its own URL would be
 * asserting an access decision it is not entitled to make.
 */

export interface DemoVideoCardProps {
  playbackUrl: string;
  /**
   * A still chosen for having something ON it — see `frameScore.ts`. Optional,
   * and allowed to 404: a camera-off recording has no good frame, and the player
   * then shows its own first frame as before. A missing picture must never break
   * a working demo.
   */
  thumbnailUrl?: string | null;
  durationSeconds: number | null;
  viewLabel: string;
  /** The author's own words. Shown above the player, as the post body already is. */
  summary?: string | null;
  /**
   * What kind of presentation this is — "Working-system demo", "Project
   * introduction". Lets a viewer tell a 90-second intro from a full showcase
   * before committing to watch. Optional: an older post carries none.
   */
  presentationTypeLabel?: string | null;
}

const mmss = (s: number | null): string | null => {
  if (typeof s !== 'number' || !Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
};

const DemoVideoCard: React.FC<DemoVideoCardProps> = ({
  playbackUrl, thumbnailUrl, durationSeconds, viewLabel, presentationTypeLabel,
}) => {
  const [playing, setPlaying] = useState(false);
  const length = mmss(durationSeconds);

  return (
    <div className="demo-card" data-testid="demo-video-card" style={{ marginTop: 10 }}>
      <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        <video
          data-testid="demo-video-player"
          controls={playing}
          autoPlay={playing}
          playsInline
          style={{ width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'contain' }}
          // WITH a poster, the browser paints that and fetches no video at all until
          // play — the metadata request per card goes away entirely. WITHOUT one,
          // the `#t=1` fragment is the fallback that at least paints something.
          poster={thumbnailUrl || undefined}
          src={playing || thumbnailUrl ? playbackUrl : `${playbackUrl}#t=1`}
          // `none` once a poster exists: nothing about the video is needed to draw
          // the card. Without a poster we still need metadata for the fragment.
          preload={thumbnailUrl && !playing ? 'none' : 'metadata'}
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
        <span aria-hidden="true">🎬 </span>
        {/* The KIND replaces the generic word when we know it: "Working-system
            demo · 3 people have watched this" tells a viewer more than "Demo"
            ever could, and it is the whole point of classifying takes. */}
        {presentationTypeLabel || 'Demo'} · {viewLabel}
      </p>
    </div>
  );
};

export default DemoVideoCard;
