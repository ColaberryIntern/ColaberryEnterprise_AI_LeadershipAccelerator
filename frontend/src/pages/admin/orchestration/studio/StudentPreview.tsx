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
  parts?: string[] | null;
}

const StudentPreview: React.FC<Props> = ({ band, label, experience, videoUrl }) => {
  const card = adaptToFeedCard({ render_band: band, label, student_label: label, experience, videoUrl });
  return (
    <div className="tl-de">
      <div className="tld-inlinepanel">
        <CardDetailBody card={card} preview />
      </div>
    </div>
  );
};

export default StudentPreview;
