import React, { useCallback, useEffect, useState } from 'react';
import type { CareerProfile } from '../../../../services/careerApi';
import { CASE_STUDY_SURFACES } from '../../../../config/caseStudySurfaces';
import {
  fetchAvailability, fetchCaseStudyOrder, fetchHireInterviews, fetchHireIntro,
  type CaseStudyOrder, type HireInterview, type HireIntro, type InterviewAvailability,
} from '../../../../services/hireStudioApi';
import { checklist, SECTIONS, strength, timesDone, type Loaded, type StudioSection } from './hireStudioModel';
import HireOverview from './HireOverview';
import HireAboutYou from './HireAboutYou';
import HireInterviewTimes from './HireInterviewTimes';
import HireCaseStudyOrder from './HireCaseStudyOrder';
import HireIntroVideo from './HireIntroVideo';
import './HireStudio.css';

/**
 * HireStudio - "My Hire profile", the candidate's side of hire.refactored.ai (kit Part 3).
 *
 * Each source loads on its own and fails on its own: a section whose data could not be read says
 * so and offers a retry, and the rest of the studio keeps working. Nothing here publishes a
 * profile; the candidate's answers, times and order go live on Hire within the profile's two
 * minute cache, and only for a profile that is already published there.
 */

const HIRE_BASE = CASE_STUDY_SURFACES.hire.liveUrl;

interface Props {
  profile: CareerProfile;
  /** Jump to another studio tab (the publishing checklist item). */
  onJumpTab: (tab: 'publishing') => void;
}

const pending = <T,>(): Loaded<T> => ({ value: null, failed: false });

const HireStudio: React.FC<Props> = ({ profile, onJumpTab }) => {
  const [section, setSection] = useState<StudioSection>('overview');
  const [intro, setIntro] = useState<Loaded<HireIntro>>(pending);
  const [availability, setAvailability] = useState<Loaded<InterviewAvailability>>(pending);
  const [order, setOrder] = useState<Loaded<CaseStudyOrder>>(pending);
  const [interviews, setInterviews] = useState<Loaded<HireInterview[]>>(pending);

  const load = useCallback(() => {
    const run = <T,>(get: () => Promise<T>, set: (l: Loaded<T>) => void) =>
      get().then((value) => set({ value, failed: false })).catch(() => set({ value: null, failed: true }));
    run(fetchHireIntro, setIntro);
    run(fetchAvailability, setAvailability);
    run(fetchCaseStudyOrder, setOrder);
    run(fetchHireInterviews, setInterviews);
  }, []);
  useEffect(load, [load]);

  const items = checklist({ profile, intro: intro.value, availability: availability.value, order: order.value });
  const done = strength(items);
  const firstName = (profile.identity?.full_name || '').trim().split(/\s+/)[0] || 'there';
  const pendingCount = (interviews.value ?? []).filter((i) => i.status === 'requested').length;
  const openBlocks = availability.value && timesDone(availability.value) ? availability.value.blocks.length : 0;

  const badge = (key: StudioSection): { text: string; gold?: boolean } | null => {
    if (key === 'overview') return pendingCount ? { text: `${pendingCount} request${pendingCount === 1 ? '' : 's'}`, gold: true } : null;
    if (key === 'video') return intro.value?.video?.status === 'published' ? null : { text: 'to do' };
    if (key === 'about') return items.find((i) => i.key === 'about')?.done ? null : { text: 'to do' };
    if (key === 'times') return openBlocks ? { text: `${openBlocks} open` } : { text: 'to do' };
    return order.value ? { text: String(order.value.cases.length) } : null;
  };

  const jump = (target: StudioSection | 'publishing' | null) => {
    if (target === 'publishing') onJumpTab('publishing');
    else if (target) setSection(target);
  };

  const talentSlug = order.value?.talentSlug ?? null;

  return (
    <div className="hs" data-testid="hire-studio">
      <div className="hs-head">
        <div>
          <div className="hs-label">My Hire profile</div>
          <h2 className="hs-h1">Hi {firstName}. Let employers hear it from you.</h2>
          {talentSlug && HIRE_BASE && (
            <a className="cp-link" href={`${HIRE_BASE}/talent/${encodeURIComponent(talentSlug)}/`} target="_blank" rel="noopener noreferrer" data-testid="hs-preview">
              Preview my public profile ↗
            </a>
          )}
        </div>
        <div className="hs-strength">
          <div className="hs-strength-n"><b>{done}</b> of {items.length}</div>
          <div className="hs-meter" role="progressbar" aria-label="Profile strength" aria-valuemin={0} aria-valuemax={items.length} aria-valuenow={done} data-testid="hs-strength">
            <i style={{ transform: `scaleX(${done / items.length})` }} />
          </div>
          <div className="hs-strength-l">Profile strength</div>
        </div>
      </div>

      <div className="hs-cols">
        <nav className="hs-menu" aria-label="Hire profile sections">
          {SECTIONS.map((s) => {
            const b = badge(s.key);
            return (
              <button key={s.key} type="button" className={`hs-menu-i${section === s.key ? ' on' : ''}`}
                aria-current={section === s.key ? 'page' : undefined} onClick={() => setSection(s.key)} data-testid={`hs-menu-${s.key}`}>
                <span>{s.label}</span>
                {b && <span className={`hs-badge${b.gold ? ' gold' : ''}`}>{b.text}</span>}
              </button>
            );
          })}
        </nav>

        <div className="hs-body">
          {section === 'overview' && (
            <HireOverview items={items} interviews={interviews} availability={availability.value} onJump={jump}
              caseTitles={Object.fromEntries((order.value?.cases ?? []).map((c) => [c.slug, c.title]))}
              onChanged={(next) => setInterviews({ value: next, failed: false })} onRetry={load} />
          )}
          {section === 'video' && <HireIntroVideo video={intro.value?.video ?? null} />}
          {section === 'about' && (
            <HireAboutYou loaded={intro} onSaved={(v) => setIntro({ value: v, failed: false })} onRetry={load} />
          )}
          {section === 'times' && (
            <HireInterviewTimes loaded={availability} onSaved={(v) => setAvailability({ value: v, failed: false })} onRetry={load} />
          )}
          {section === 'cases' && (
            <HireCaseStudyOrder loaded={order} onSaved={(slugs) => order.value && setOrder({ value: { ...order.value, slugs }, failed: false })} onRetry={load} />
          )}
        </div>
      </div>
    </div>
  );
};

export default HireStudio;
