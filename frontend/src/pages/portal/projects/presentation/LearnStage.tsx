import React, { useEffect, useState } from 'react';
import LearnPanel from './LearnPanel';
import { fetchAssignment } from './presentationApi';

/**
 * Resolves WHICH lesson to show, then shows it.
 *
 * The template is read from the learner's own assignment rather than guessed
 * client-side. Duplicating the task-to-template mapping in the browser would let the
 * lesson a student reads drift from the template their deck prompt is actually built
 * from, which is the worst kind of inconsistency here — they would prepare for one
 * presentation and generate another.
 */

export interface LearnStageProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
}

export default function LearnStage({ projectId, storyId, demo }: LearnStageProps) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (demo) return;
    let live = true;
    setError('');
    fetchAssignment(projectId, storyId)
      .then((a) => { if (live) setTemplateId(a.templateId); })
      .catch((err: any) => {
        if (!live) return;
        setError(err?.response?.data?.error || 'Could not work out which lesson belongs to this task.');
      });
    return () => { live = false; };
  }, [projectId, storyId, demo]);

  if (demo) {
    return (
      <div className="ps-pending" data-testid="ps-learn-demo">
        <strong>This is a preview account.</strong>
        Lessons are shown against a real student&rsquo;s own task, so there is nothing to load here.
      </div>
    );
  }
  if (error) return <p className="ps-note" role="alert" data-testid="ps-learn-error">{error}</p>;
  if (!templateId) return <p className="ps-note ps-note--soft" data-testid="ps-learn-loading">Loading the lesson&hellip;</p>;

  return <LearnPanel templateId={templateId} />;
}
