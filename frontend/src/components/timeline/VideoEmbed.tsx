import React, { useState } from 'react';
import { VideoSource, providerLabel, withAutoplay } from '../../utils/videoEmbed';

/**
 * VideoEmbed — plays a lesson video in-app from any supported link (YouTube,
 * Vimeo, Loom, Wistia, or a direct file), with no third-party player library.
 * Shows a poster + play button first (so we never autoplay audio on open); on
 * play it swaps to the live embed. Direct-file videos report `onEnded` so the
 * card can auto-complete; iframe providers complete via an explicit action.
 */

interface Props {
  source: VideoSource | null;
  title?: string;
  poster?: string | null;
  onEnded?: () => void;
  /** A corner ribbon label drawn over the poster (e.g. "Testimonial") so the card
   *  type is always visible on the thumbnail. */
  badge?: string | null;
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
);

const VideoEmbed: React.FC<Props> = ({ source, title, poster, onEnded, badge }) => {
  const [playing, setPlaying] = useState(false);

  const ribbon = badge ? <span className="tlv-ribbon">{badge}</span> : null;

  if (!source) {
    return <div className="tlv-none">No video is attached to this card yet.</div>;
  }

  // Unknown / unsupported URL — offer to open it at the source.
  if (source.kind === 'link') {
    return (
      <div className="tlv-frame tlv-link">
        {ribbon}
        <div className="tlv-linkbody">
          <p>This video is hosted on {providerLabel(source.provider)}.</p>
          <a className="tl-btn primary sm" href={source.originalUrl} target="_blank" rel="noopener noreferrer">
            Watch on {providerLabel(source.provider)}
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
        </div>
      </div>
    );
  }

  if (!playing) {
    return (
      <button type="button" className="tlv-frame tlv-poster" onClick={() => setPlaying(true)} aria-label={`Play ${title || 'video'}`}>
        {poster && <img className="tlv-posterimg" src={poster} alt="" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />}
        <span className="tlv-postergrad" />
        {ribbon}
        <span className="tlv-bigplay"><PlayIcon /></span>
        {title && <span className="tlv-postertitle">{title}</span>}
      </button>
    );
  }

  if (source.kind === 'file') {
    return (
      <div className="tlv-frame">
        <video className="tlv-media" src={source.embedUrl} controls autoPlay onEnded={onEnded}>
          <track kind="captions" />
        </video>
      </div>
    );
  }

  // iframe providers (youtube / vimeo / loom / wistia)
  return (
    <div className="tlv-frame">
      <iframe
        className="tlv-media"
        src={withAutoplay(source)}
        title={title || 'Lesson video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
};

export default VideoEmbed;
