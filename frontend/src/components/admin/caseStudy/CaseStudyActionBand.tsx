import React from 'react';

/**
 * CaseStudyActionBand — what the last write did, on whichever tab did it.
 *
 * THE DEFECT THIS EXISTS TO CLOSE, observed on production 2026-08-26.
 *
 * `useCaseStudyDesk` funnels every write through one `act()` helper that sets
 * exactly one `actionNote` and one `actionError`. Before the page became seven
 * tabs, both were rendered by `CaseStudyPublishPanel` and the whole record was
 * one scroll, so "the panel that shows the outcome" was always on screen.
 *
 * Tabs broke that silently. Saving consent lives on TRUTH; attaching, detaching,
 * re-roling and syncing a repository live on SOURCES; every §34 override lives
 * on TRUTH, STORY or VISUALS. All of them wrote their outcome — success AND
 * failure — into a panel that only renders on PUBLISH. Pressing "Save consent"
 * on a live record and having it fail produced no visible change whatsoever: no
 * banner, no error, nothing. The operator's only signal that the write failed
 * was that the value they typed was still there.
 *
 * SO THE FIX IS THE ONE THE GATE BAND ALREADY MADE. `CaseStudyGateBand` sits
 * above the tab strip precisely so a refusal cannot be hidden by a tab, and its
 * header says so. The same argument applies word for word to the outcome of a
 * write, and the same mechanism answers it: this band renders above the strip,
 * on every tab, and `AdminCaseStudies.tabs.test.tsx` proves it by walking all
 * seven.
 *
 * IT RENDERS NOTHING WHEN THERE IS NOTHING TO SAY. An always-present empty
 * frame above the tabs would cost a row of vertical space on every tab forever
 * to report the absence of news. `null` is the honest shape: the band appears
 * when a write has happened and says what it did.
 */

interface Props {
  /** The success line from the last write, or null if none has happened. */
  note: string | null;
  /** The failure line from the last write, or null. */
  error: string | null;
}

export default function CaseStudyActionBand({ note, error }: Props): React.ReactElement | null {
  if (!note && !error) return null;

  return (
    <div data-testid="cs-action-band">
      {error ? (
        <div className="alert alert-danger py-2 mb-3" role="alert" data-testid="cs-action-error">
          {error}
        </div>
      ) : null}
      {note ? (
        <div className="alert alert-success py-2 mb-3" role="status" data-testid="cs-action-note">
          {note}
        </div>
      ) : null}
    </div>
  );
}
