import React from 'react';
import type { PublicCaseStudyDetail } from '../../services/caseStudyPublicTypes';

/**
 * StoryHeroFigure - page-local, like `StoryFigure`, `StoryDiagram` and `StoryMediaCarousel`.
 *
 * WHY IT IS ITS OWN FILE. `storyDetailV2Sections.tsx` reached 422 lines against the 300 its
 * own contract test holds it to, and the seam that file's header already names is pictures
 * versus argument - `storyMediaV2.css` was split from `storyDetailV2.css` on exactly that
 * line, and `StoryFigure`, `StoryDiagram` and `StoryMediaCarousel` already live as
 * page-local picture components. The hero figure is a picture. It joins them.
 *
 * Nothing here changed in the move. The player, the embed branch and every comment about
 * captions, cross-origin and autoplay are as they were; only the file boundary moved.
 */

/**
 * The masthead's picture: the walkthrough player when the record has one, the cover
 * image otherwise.
 *
 * ONE SLOT, NOT TWO. This began as a band under the masthead, and that shipped a record
 * opening with two visuals doing the same job - a screenshot of the product, then a film
 * of the product, with the reader scrolling past the first to reach the second. The hero
 * already owns a picture slot and the masthead's right half was built for it.
 *
 * THE POSTER FALLS BACK TO THE COVER, so a record with a walkthrough looks exactly as it
 * did until somebody presses play, and a record without one is untouched.
 *
 * A NATIVE `video`, NOT AN EMBED. The platform serves the file, so no third party is
 * handed a record of who watched a client's delivery. `media-src` already allows the
 * platform origin here, where an embed would need `frame-src` and hand playback away.
 *
 * NOT AUTOPLAYED, and `preload="none"`. It carries narration, and a page that starts
 * talking at a reader who came to read is a page they leave; a multi-megabyte file should
 * not be fetched by every visitor who never presses play. The poster is what they see, so
 * nothing is lost by not preloading.
 */
export function StoryHeroFigure({
  video,
  cover,
}: {
  video: PublicCaseStudyDetail['walkthroughVideo'];
  cover: { src: string; alt: string } | null;
}): React.ReactElement | null {
  /**
   * AN OPERATOR'S OWN VIDEO PLAYS THROUGH AN IFRAME, not this `<video>`.
   *
   * It has to be checked before the file branch, because the projection sets `url` to null
   * when an embed wins — falling through would render a `<video>` with no source, which
   * shows as an empty black box rather than as an error.
   *
   * Nothing from the generated video comes with it. No caption `track`: our WebVTT is the
   * narration script for OUR footage. No `crossorigin`: we are not reading these bytes. No
   * synthetic-voice note: that would claim a machine narrated a video a human recorded.
   */
  if (video?.embedUrl) {
    return (
      <figure className="cbv2-story__cover cbv2-story__cover--video cbv2-story__cover--embed">
        <iframe
          className="cbv2-story__walkthrough-embed"
          src={video.embedUrl}
          title={video.title}
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
        <figcaption className="cbv2-story__walkthrough-note">
          {video.title}
          {video.watchUrl ? (
            <>
              {' '}
              <a href={video.watchUrl} target="_blank" rel="noopener noreferrer">
                {video.provider === 'vimeo' ? 'Watch on Vimeo' : 'Watch on YouTube'}
              </a>
            </>
          ) : null}
        </figcaption>
      </figure>
    );
  }

  if (video?.url) {
    return (
      <figure className="cbv2-story__cover cbv2-story__cover--video">
          {/* `crossorigin` is what makes the CAPTIONS work on the other two brands. A
              cross-origin `track` is refused unless the media element is a CORS request,
              and this file is served from the platform while the page may be
              training.colaberry.com or aiflotation.com. Without it the track's
              readyState goes to 3 (ERROR) and the cue list stays empty, while the video
              plays perfectly and the .vtt returns a healthy 200 — so nothing looks
              broken except the missing captions. nginx sends
              `Access-Control-Allow-Origin` on both the .vtt and the .mp4 to match; the
              attribute and the header are one change, not two. */}
        <video
          className="cbv2-story__walkthrough-player"
          controls
          preload="none"
          playsInline
          crossOrigin="anonymous"
          poster={video.posterUrl ?? cover?.src ?? undefined}
        >
          <source src={video.url} type="video/mp4" />
          {/* Separate from the captions burned into the picture: burned-in text cannot be
              resized, translated, turned off, or read by a screen reader.

              NOT `default`, deliberately. `build_video.py` burns the narration into the
              frame, so a shown track paints the same words a second time in the browser's
              own bar - two read-overs on one frame, which shipped on two live records.
              The sidecar stays attached and reachable from the CC control and to
              assistive technology, which is the job it was written for. */}
          {video.captionsUrl ? (
            <track kind="captions" srcLang="en" label="English" src={video.captionsUrl} />
          ) : null}
        </video>
        {/* Said on the page rather than left to be assumed. An unlabelled synthetic voice
            is a small deception, and this system's whole claim is that it does not make
            those. */}
        {video.narrationSource === 'synthetic' ? (
          <figcaption className="cbv2-story__walkthrough-note">
            {video.title}. Narrated by a synthetic voice; the figures it states are the
            verified metrics recorded below.
          </figcaption>
        ) : (
          <figcaption className="cbv2-story__walkthrough-note">{video.title}</figcaption>
        )}
      </figure>
    );
  }
  if (!cover) return null;
  return (
    <figure className="cbv2-story__cover">
      <img src={cover.src} alt={cover.alt} loading="eager" decoding="async" />
    </figure>
  );
}
