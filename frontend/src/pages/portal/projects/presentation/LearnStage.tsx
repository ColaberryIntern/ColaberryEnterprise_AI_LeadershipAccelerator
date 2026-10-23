import React, { useCallback, useEffect, useState } from 'react';
import LearnPanel from './LearnPanel';
import TemplateChooser from './TemplateChooser';
import { fetchPresentationTypes } from './presentationApi';
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
  /**
   * A type the learner asked to start, from an empty portfolio slot. Pre-selected
   * and PERSISTED exactly as a manual click would be, so the checklist, timings
   * and deck prompt all follow — a pre-selection that only highlighted a card
   * would be a lie about what the rest of the page is built from.
   */
  pendingType?: string | null;
}

export default function LearnStage({ projectId, storyId, demo, pendingType }: LearnStageProps) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  // Dismissed per visit, not stored: the banner explains why the page looks the
  // way it does right now, and a learner returning later does not need it again.
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [appliedPending, setAppliedPending] = useState(false);
  // The banner needs a human label for the id in the URL. Fetched from the same
  // registry the chooser uses, rather than a second hardcoded map that would
  // drift from it.
  const [pendingLabel, setPendingLabel] = useState<string | null>(null);

  useEffect(() => {
    if (demo || !pendingType) { setPendingLabel(null); return; }
    let live = true;
    fetchPresentationTypes()
      .then((types) => {
        if (live) setPendingLabel(types.find((t) => t.id === pendingType)?.label ?? null);
      })
      .catch(() => { /* no banner is better than a banner naming a raw id */ });
    return () => { live = false; };
  }, [demo, pendingType]);

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

  /**
   * Honour the deep link, ONCE, and only after the current value is known.
   *
   * Running before the assignment loads would compare against a null template and
   * save a type the learner already had, and running more than once would fight a
   * learner who changed their mind on this very screen.
   */
  useEffect(() => {
    if (demo || appliedPending || !pendingType) return;
    if (templateId === null) return;
    setAppliedPending(true);
    if (pendingType !== templateId) chooseTemplate(pendingType);
  }, [demo, appliedPending, pendingType, templateId, chooseTemplate]);

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
      {/* SAYS WHY THE PAGE LOOKS LIKE THIS. A learner arriving from an empty
          portfolio slot finds a type already chosen and the whole lesson changed
          under them; without a line explaining that, it reads as the page having
          decided something on its own. */}
      {pendingLabel && !bannerDismissed && (
        <div className="ps-card" data-testid="ps-learn-type-banner" style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span aria-hidden="true">🎬</span>
          <span>
            Getting ready to record: <strong>{pendingLabel}</strong>. Your checklist,
            timings and deck prompt now follow this type.
          </span>
          <button
            type="button"
            className="ps-btn ps-btn--quiet"
            data-testid="ps-learn-banner-dismiss"
            style={{ marginLeft: 'auto' }}
            onClick={() => setBannerDismissed(true)}
          >
            Dismiss
          </button>
        </div>
      )}
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
