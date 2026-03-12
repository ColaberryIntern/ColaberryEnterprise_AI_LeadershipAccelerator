import React, { useState, useCallback } from 'react';
import { submitContentFeedback } from '../../../services/reportingApi';

type FeedbackState = 'useful' | 'not_useful' | 'favorite' | null;

interface FeedbackButtonsProps {
  contentType: string;
  contentKey: string;
  size?: 'sm' | 'xs';
  className?: string;
}

export default function FeedbackButtons({ contentType, contentKey, size = 'xs', className = '' }: FeedbackButtonsProps) {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = useCallback(async (type: 'useful' | 'not_useful' | 'favorite') => {
    if (submitting) return;
    const newType = feedback === type ? null : type;
    setFeedback(newType);
    if (!newType) return;

    setSubmitting(true);
    try {
      await submitContentFeedback(contentType, contentKey, type);
    } catch {
      // Silent — feedback is non-critical
    }
    setSubmitting(false);
  }, [contentType, contentKey, feedback, submitting]);

  const btnSize = size === 'xs' ? { fontSize: '0.6rem', padding: '1px 4px' } : { fontSize: '0.7rem', padding: '2px 6px' };

  return (
    <div className={`d-inline-flex gap-0 ${className}`} role="group" aria-label="Rate this content">
      <button
        className={`btn btn-sm border-0 ${feedback === 'useful' ? 'text-success' : 'text-muted'}`}
        style={{ ...btnSize, opacity: feedback === 'useful' ? 1 : 0.5, transition: 'opacity 0.15s' }}
        onClick={(e) => { e.stopPropagation(); handleFeedback('useful'); }}
        title="Useful"
        aria-label="Mark as useful"
        aria-pressed={feedback === 'useful'}
      >
        &#128077;
      </button>
      <button
        className={`btn btn-sm border-0 ${feedback === 'not_useful' ? 'text-danger' : 'text-muted'}`}
        style={{ ...btnSize, opacity: feedback === 'not_useful' ? 1 : 0.5, transition: 'opacity 0.15s' }}
        onClick={(e) => { e.stopPropagation(); handleFeedback('not_useful'); }}
        title="Not useful"
        aria-label="Mark as not useful"
        aria-pressed={feedback === 'not_useful'}
      >
        &#128078;
      </button>
      <button
        className={`btn btn-sm border-0 ${feedback === 'favorite' ? 'text-warning' : 'text-muted'}`}
        style={{ ...btnSize, opacity: feedback === 'favorite' ? 1 : 0.5, transition: 'opacity 0.15s' }}
        onClick={(e) => { e.stopPropagation(); handleFeedback('favorite'); }}
        title="Favorite"
        aria-label="Mark as favorite"
        aria-pressed={feedback === 'favorite'}
      >
        &#11088;
      </button>
    </div>
  );
}
