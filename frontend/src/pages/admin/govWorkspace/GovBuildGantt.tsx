import React, { useState } from 'react';
import type { GovDatedPlan, GovDatedRelease, GovDatedStory } from '../../../services/factoryApi';
import { layoutGantt } from './govGanttLayout';

/**
 * GovBuildGantt — a command-center-style view of the advisory, dated build plan: releases laid out as
 * proportional bars across a shared date axis (a Gantt is a date scale and two divs — no charting lib),
 * each release expandable to its stories, each story expandable to full detail (narrative, Gherkin
 * acceptance, task guidance, failure paths, dependencies, fulfilled requirements). Read-only; advisory.
 */
function StoryDetail({ story }: { story: GovDatedStory }): React.ReactElement {
  return (
    <div className="border rounded p-2 mt-1 bg-body-tertiary">
      {story.narrative && <div className="small mb-1"><span className="text-secondary">Narrative:</span> {story.narrative}</div>}
      {story.fulfills.length > 0 && <div className="small mb-1"><span className="text-secondary">Fulfills:</span> {story.fulfills.join(', ')}</div>}
      {story.acceptance.length > 0 && (
        <div className="small mb-1">
          <span className="text-secondary">Acceptance:</span>
          <ul className="mb-1">{story.acceptance.map((a, i) => <li key={i} className={a.trim().startsWith('Trust') ? 'fw-semibold' : undefined}>{a}</li>)}</ul>
        </div>
      )}
      {story.taskGuidance && <div className="small mb-1"><span className="text-secondary">How to build:</span> {story.taskGuidance}</div>}
      {story.failurePaths.length > 0 && (
        <div className="small mb-1"><span className="text-secondary">Failure paths:</span> {story.failurePaths.join('; ')}</div>
      )}
      {story.blockedBy.length > 0 && <div className="small mb-0"><span className="text-secondary">Blocked by:</span> {story.blockedBy.join(', ')}</div>}
    </div>
  );
}

export function GovBuildGantt({ plan }: { plan: GovDatedPlan }): React.ReactElement {
  const [openReleases, setOpenReleases] = useState<Record<string, boolean>>({});
  const [openStories, setOpenStories] = useState<Record<string, boolean>>({});
  const toggleRelease = (k: string) => setOpenReleases((m) => ({ ...m, [k]: !m[k] }));
  const toggleStory = (k: string) => setOpenStories((m) => ({ ...m, [k]: !m[k] }));

  const { axis, bars } = layoutGantt(plan.releases.map((r) => ({ key: r.key, startDate: r.startDate, endDate: r.endDate })));
  const barByKey = new Map(bars.map((b) => [b.key, b]));
  const storiesByRelease = new Map<string, GovDatedStory[]>();
  for (const s of plan.stories) {
    const arr = storiesByRelease.get(s.release) ?? [];
    arr.push(s);
    storiesByRelease.set(s.release, arr);
  }

  const releaseTone = (r: GovDatedRelease): string =>
    r.isRoadmap ? 'bg-secondary-subtle text-secondary-emphasis' : r.isDemoRelease ? 'bg-success-subtle text-success-emphasis' : 'bg-primary-subtle text-primary-emphasis';

  return (
    <div>
      <div className="d-flex justify-content-between small text-secondary mb-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
        <span>{axis ? axis.minDate : ''}</span>
        <span>{axis ? `~${Math.max(1, Math.round(axis.totalDays / 7))} wks` : ''}</span>
        <span>{axis ? axis.maxDate : ''}</span>
      </div>
      <ul className="list-unstyled mb-2">
        {plan.releases.map((r) => {
          const bar = barByKey.get(r.key);
          const stories = storiesByRelease.get(r.key) ?? [];
          const open = !!openReleases[r.key];
          return (
            <li key={r.key} className="mb-2">
              <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none d-flex align-items-center gap-2 w-100" onClick={() => toggleRelease(r.key)}>
                <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                <span className="fw-semibold">{r.name}</span>
                <span className={`badge ${releaseTone(r)}`}>{r.isRoadmap ? 'later' : r.isDemoRelease ? 'final' : 'build'}</span>
                <span className="text-secondary small ms-auto" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.startDate} → {r.endDate} · {stories.length} stor{stories.length === 1 ? 'y' : 'ies'}</span>
              </button>
              {/* The Gantt bar on the shared date axis. */}
              <div className="position-relative rounded" style={{ height: 14, background: 'var(--bs-tertiary-bg, #eef1f5)' }}>
                {bar && <div className="rounded" title={`${r.startDate} → ${r.endDate}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${bar.leftPct}%`, width: `${bar.widthPct}%`, background: r.isRoadmap ? 'var(--bs-secondary, #6c757d)' : r.isDemoRelease ? 'var(--bs-success, #198754)' : 'var(--bs-primary, #0d6efd)' }} />}
              </div>
              {r.goal && <div className="small text-secondary mt-1">{r.goal}{r.demo ? ` — demo: ${r.demo}` : ''}</div>}
              {open && (
                <ul className="list-unstyled ms-3 mt-1 border-start ps-2">
                  {stories.map((s) => {
                    const so = !!openStories[s.id];
                    return (
                      <li key={s.id} className="py-1 border-bottom">
                        <button type="button" className="btn btn-link btn-sm px-0 text-decoration-none d-flex align-items-center gap-2 w-100" onClick={() => toggleStory(s.id)}>
                          <i className={`ri-arrow-${so ? 'down' : 'right'}-s-line`} aria-hidden="true" />
                          <span>{s.title}</span>
                          <span className="text-secondary small ms-auto" style={{ fontVariantNumeric: 'tabular-nums' }}>due {s.dueDate}</span>
                        </button>
                        {so && <StoryDetail story={s} />}
                      </li>
                    );
                  })}
                  {stories.length === 0 && <li className="small text-secondary">No stories in this release.</li>}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <div className="small text-secondary"><i className="ri-time-line me-1" aria-hidden="true" />Projected <strong>post-award</strong> build timeline — the build runs after award, so dates are relative to the build start, not the proposal submission deadline.</div>
    </div>
  );
}
