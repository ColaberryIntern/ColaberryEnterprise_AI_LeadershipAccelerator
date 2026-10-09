import React, { useCallback, useEffect, useState } from 'react';
import LearnPanel from './LearnPanel';
import TemplateChooser from './TemplateChooser';
import { fetchAssignment, saveAssignment } from './presentationApi';

/**
 * The type of presentation, and then the lesson for it.
 *
 * WHY THE TYPE IS ASKED FIRST, HERE, BEFORE ANYTHING ELSE.
 *
 *     "The presentation types should be at the very beginning since they drive
 *      what is being built."  (Ali, 2026-10-06)
 *
 * It used to be chosen on Prepare, the SECOND stage — and Learn, the first, already
 * said "see what good looks like for this kind of presentation" while fetching a
 * lesson keyed on a type the student had not been asked about yet. They read the
 * lesson for whatever the task defaulted to, chose a different type one stage later,
 * and the thing they had just learned from quietly stopped applying. The type also
 * drives the checklist, the timings and the deck prompt, so every one of those was
 * downstream of a decision made after the teaching.
 *
 * Now it is the first control on the first stage, and the lesson underneath it
 * re-renders when it changes — so the answer and its consequence are on one screen.
 *
 * The template is still READ from the learner's own assignment rather than guessed
 * client-side, and still SAVED through the same endpoint Prepare used. Duplicating
 * the task-to-template mapping in the browser would let the lesson a student reads
 * drift from the template their deck prompt is built from, which is the worst kind of
 * inconsistency here — they would prepare for one presentation and generate another.
 */

export interface LearnStageProps {
  projectId: string;
  storyId: string;
  demo?: boolean;
}

export default function LearnStage({ projectId, storyId, demo }: LearnStageProps) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

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

  /**
   * Saved immediately rather than debounced: this is a deliberate click, not typing,
   * and the lesson below changes as a result. Waiting on a timer to act reads as the
   * control being broken. The same reasoning Prepare applied when it owned this.
   *
   * The local value is only moved once the SERVER has taken it. Swapping the lesson
   * optimistically and then failing the save would leave a student reading the lesson
   * for a type their deck prompt will not use.
   */
  const chooseTemplate = useCallback((next: string) => {
    if (demo || !next || next === templateId) return;
    setSaving(true);
    setSaveError('');
    saveAssignment(projectId, storyId, { template: next })
      .then((d) => { setTemplateId(d.templateId); })
      .catch((err: any) => {
        setSaveError(err?.response?.data?.error || 'Could not save that presentation type. Your previous choice still stands.');
      })
      .finally(() => { setSaving(false); });
  }, [projectId, storyId, demo, templateId]);

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

  return (
    <div data-testid="ps-learn-stage">
      <div className="ps-card" data-testid="ps-type-first">
        <h3>Presentation type</h3>
        <TemplateChooser value={templateId} onChange={chooseTemplate} disabled={saving} />
        {saveError && <p className="ps-note" role="alert" data-testid="ps-type-error">{saveError}</p>}
        <p className="ps-note ps-note--soft" style={{ marginTop: 10 }} data-testid="ps-type-why">
          This is the first question because it drives the rest: the lesson below, your
          checklist, your timings and the deck prompt all follow from it. You can change it
          later and they all change with it.
        </p>
      </div>
      <LearnPanel templateId={templateId} />
    </div>
  );
}
