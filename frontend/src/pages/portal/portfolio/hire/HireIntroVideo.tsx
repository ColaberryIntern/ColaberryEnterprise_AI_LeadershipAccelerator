import React from 'react';

/**
 * Intro video (kit §3.2). Recording, upload, captions and publishing arrive in Phase 5, on the
 * Colaberry video platform. Until then this section says what is coming and shows the prompts so
 * a candidate can prepare. It never offers a control that does nothing.
 */

const PROMPTS = [
  'Who you are, and the role you want next.',
  'One problem you solved, and what changed because of it.',
  'What you would do in your first 30 days on a new team.',
];

interface Props {
  video: { status: string; seconds: number | null } | null;
}

const HireIntroVideo: React.FC<Props> = ({ video }) => (
  <section className="cp-card" aria-labelledby="hs-video-h" data-testid="hs-video">
    <h3 className="cp-card-h" id="hs-video-h">Intro video</h3>
    {video?.status === 'published'
      ? <p className="cp-ok">Your intro video is live on Hire{video.seconds ? ` (${Math.round(video.seconds)}s)` : ''}.</p>
      : (
        <p className="cp-muted" data-testid="hs-video-soon">
          Recording in the browser is on its way. You will record or upload a 90-second video here, it
          stays a draft until you publish it, and captions are added for you. To get ready, here are the
          three prompts it will walk you through:
        </p>
      )}
    <ol className="hs-prompts">
      {PROMPTS.map((p) => <li key={p}>{p}</li>)}
    </ol>
  </section>
);

export default HireIntroVideo;
