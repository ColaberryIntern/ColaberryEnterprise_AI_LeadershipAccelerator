import React from 'react';
import { useMyProgress } from './myProgressApi';
import { useResumeUpload } from './ResumeUpload';
import { STORY_POINTS } from './myProgressView';
import './myProgress.css';

/**
 * C120: the My Progress arrival panel's "Upload resume or LinkedIn PDF" card (the design's right-hand panel). Before an upload it
 * invites the story (+25 pts, the existing setup reward); after, it lets the learner replace or remove the file. Either way the
 * room's screen re-reads and shows the result (one shared read, myProgressApi). Until the read answers, nothing is shown (never a
 * guessed state); a failed read shows nothing either, and Settings keeps its own upload.
 */
export default function StoryUploadCard({ enabled }: { enabled: boolean }): React.ReactElement | null {
  const { data } = useMyProgress(enabled);
  const up = useResumeUpload('cm-mp-file-panel');
  if (!enabled || !data) return null;
  return (
    <section className="cm-mp-card" data-testid="cm-mp-card" aria-labelledby="cm-mp-card-h">
      <h3 className="cm-card-h" id="cm-mp-card-h">{data.hasResume ? 'Your story' : 'Tell us your story'}</h3>
      <p>{data.hasResume
        ? 'Your background on the screen comes from your resume. Upload a newer one to update it.'
        : `Upload your resume or LinkedIn PDF and the screen fills in your background, your skills and your goal. +${STORY_POINTS} pts.`}</p>
      <div className="cm-mp-card-row">
        <button type="button" className="cm-btn cm-mp-card-up" onClick={up.pick} disabled={up.busy} data-testid="cm-mp-card-upload">
          {up.busy ? 'Working…' : data.hasResume ? 'Replace resume' : 'Upload resume or LinkedIn PDF'}
        </button>
        {data.hasResume && <button type="button" className="cm-btn-line" onClick={up.remove} disabled={up.busy} data-testid="cm-mp-card-remove">Remove</button>}
      </div>
      <small className="cm-mp-card-fine">PDF, Word, RTF, text or Markdown, up to 3 MB. Only you see this screen.</small>
      {up.note && <p role="status" data-testid="cm-mp-card-note">{up.note}</p>}
      {up.input}
    </section>
  );
}
