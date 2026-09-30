/**
 * "You are looking at a different project from the one you are building in."
 *
 * ── THE DAY THIS EXISTS FOR ─────────────────────────────────────────────────
 *
 * Farhat Beig finished STORY-001 in her SECOND project on 2026-09-05, pushed a
 * correctly named commit, and the platform verified it at 3 of 3 three minutes
 * later. Her portal was still pointed at her FIRST project, so the screen said
 * 0 of 3. She checked her progress.json, checked her commit, checked GitHub,
 * and every one of those was right, so the only move left was emailing a human
 * and waiting. Her work had been accepted a quarter of an hour before she wrote.
 *
 * The switcher that fixes this already existed. Nothing told her she needed it.
 * That is the entire gap this closes.
 *
 * WHY IT OFFERS AND DOES NOT ACT. The backend deliberately reports drift rather
 * than correcting it, because "switch to the newest project" is the wrong rule:
 * a student can legitimately keep an older project open while a newer one is
 * finished. So this hands the choice to the person who knows, with both project
 * names in front of them.
 */
import React, { useEffect, useState } from 'react';
import { onProjectDrift, ProjectDrift, pushActiveProject } from './projectSync';

interface Props {
  /** Called after a successful switch so the page can reload its data. */
  onSwitched?: () => void;
}

const COPY: Record<ProjectDrift['code'], (d: ProjectDrift) => string> = {
  work_elsewhere: (d) =>
    `You are viewing ${d.showing ?? 'this project'}, but your recent verified work is in ${d.working_in ?? 'another project'}.`,
  no_active_project: () =>
    'No project is selected, so this page has nothing to show.',
  active_archived: (d) =>
    `${d.showing ?? 'This project'} is archived, so it will not update as you build.`,
};

const ProjectDriftBanner: React.FC<Props> = ({ onSwitched }) => {
  const [drift, setDrift] = useState<ProjectDrift | null>(null);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => onProjectDrift(setDrift), []);

  if (!drift || dismissed) return null;

  const switchable = drift.code === 'work_elsewhere' && !!drift.working_in_id;

  return (
    <div
      role="status"
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        border: '1px solid #F0C36D', background: '#FFF8E7', borderRadius: 10,
        padding: '12px 14px', margin: '0 0 16px 0', fontSize: 14, lineHeight: 1.5,
        color: '#4A3B12',
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ width: 20, height: 20, flex: '0 0 auto', marginTop: 1 }}>
        <path d="M12 9v4M12 17h.01M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 700, marginBottom: 2 }}>This may not be the project you are building in</div>
        <div>{COPY[drift.code](drift)}</div>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {switchable && (
            <button
              type="button"
              className="te-btn cherry sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  // pushActiveProject reports its own failures through the sync
                  // failure channel, so a switch that does not take is surfaced
                  // rather than swallowed. The banner stays up either way until
                  // the next pull proves the pointer moved.
                  await pushActiveProject(drift.working_in_id as string);
                  onSwitched?.();
                } finally { setBusy(false); }
              }}
            >
              {busy ? 'Switching…' : `Switch to ${drift.working_in}`}
            </button>
          )}
          <button type="button" className="te-btn ghost sm" disabled={busy} onClick={() => setDismissed(true)}>
            Stay here
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectDriftBanner;
