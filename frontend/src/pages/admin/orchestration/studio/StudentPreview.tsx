import React from 'react';
import CardDetailBody from '../../../../components/timeline/CardDetailBody';
import { adaptToFeedCard } from '../../../../utils/cardAdapter';
import '../../../../components/timeline/timeline.css';

/**
 * StudentPreview — renders the EXACT student card view by reusing the real
 * <CardDetailBody> (the same component the Classroom drawer uses), fed a
 * synthetic card built from the Studio component + the Flow inputs. `preview`
 * disables the live-only actions. This guarantees the Studio preview and the
 * student view are the same thing — they can never diverge.
 */

interface Props {
  band: string;
  label: string;
  experience?: { title?: string; summary?: string; body_html?: string; questions?: string[]; reflection?: string } | null;
  videoUrl?: string;
  presenter?: string;
  poster?: string;
  course?: { name: string | null; url: string | null } | null;
  parts?: string[] | null;
  thumbnail?: string | null;   // the type's fixed picture — hero on non-video cards
}

const StudentPreview: React.FC<Props> = ({ band, label, experience, videoUrl, presenter, poster, course, parts, thumbnail }) => {
  const card = adaptToFeedCard({
    render_band: band, label, student_label: label, experience,
    video: { url: videoUrl || null, presenter: presenter || null, poster: poster || null },
    course, capabilities: parts, type_thumbnail: thumbnail ?? null,
  });
  return (
    <div className="tl-de">
      <div className="tld-inlinepanel">
        <CardDetailBody card={card} preview />
      </div>
    </div>
  );
};

export default StudentPreview;
