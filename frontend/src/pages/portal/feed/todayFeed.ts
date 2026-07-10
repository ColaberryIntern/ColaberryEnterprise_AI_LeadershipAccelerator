import React from 'react';
import { FeedItem, FeedSource } from './FeedCard';

// Builds the aggregated Today timeline — the "big feed" that pulls items from
// every page (onboarding, schedule, path, classroom, cert prep, community). As
// the platform + a real enrollment fills in, this is where each page's live
// task/activity items surface. For a guest it shows their real setup items plus
// previews of what each page holds, so Today reads as one connected system.
// See project memory: project_portal_fb_feed_system.

export type TodayFeedCtx = {
  ohTitle?: string | null;
  ohWhen?: string | null;
  rsvped: boolean;
  hasBackground: boolean;
  firstClassLabel?: string | null; // e.g. "Jul 23"
  // the student's most-relevant build, surfaced from the Projects tab so Today
  // reads as one connected system (null when they have no build yet)
  project?: { name: string; nextTaskTitle: string | null; status: 'creating' | 'ready' } | null;
};

export type TodayFeedHandlers = {
  onRsvp: () => void;
  onUpload: () => void;
  onSoon: (label: string) => void;
};

// ── source metadata: color + label + white inline SVG icon ──
const ICONS: Record<FeedSource, React.ReactNode> = {
  onboarding: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('path', { d: 'M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z', stroke: '#fff', strokeWidth: 2, strokeLinejoin: 'round' })),
  schedule: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('rect', { x: 3, y: 5, width: 18, height: 16, rx: 3, stroke: '#fff', strokeWidth: 2 }),
    React.createElement('path', { d: 'M3 9h18M8 3v4M16 3v4', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' })),
  path: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('circle', { cx: 5, cy: 6, r: 2.4, stroke: '#fff', strokeWidth: 2 }),
    React.createElement('circle', { cx: 19, cy: 18, r: 2.4, stroke: '#fff', strokeWidth: 2 }),
    React.createElement('path', { d: 'M5 8.4c0 5 7 2 7 7s7 0 7 0', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' })),
  classroom: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('path', { d: 'M3 8l9-4 9 4-9 4-9-4Z', stroke: '#fff', strokeWidth: 2, strokeLinejoin: 'round' }),
    React.createElement('path', { d: 'M7 11v5c0 1 2 2 5 2s5-1 5-2v-5', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' })),
  community: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('circle', { cx: 9, cy: 9, r: 3, stroke: '#fff', strokeWidth: 2 }),
    React.createElement('path', { d: 'M3 19c0-3 3-5 6-5s6 2 6 5', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' }),
    React.createElement('path', { d: 'M16 7a3 3 0 0 1 0 6', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' })),
  certprep: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('path', { d: 'M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z', stroke: '#fff', strokeWidth: 2, strokeLinejoin: 'round' }),
    React.createElement('path', { d: 'M9 11l2 2 4-4', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' })),
  people: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('circle', { cx: 12, cy: 8, r: 3.4, stroke: '#fff', strokeWidth: 2 }),
    React.createElement('path', { d: 'M5 20c0-3.4 3.1-5.5 7-5.5s7 2.1 7 5.5', stroke: '#fff', strokeWidth: 2, strokeLinecap: 'round' })),
  projects: React.createElement('svg', { viewBox: '0 0 24 24', fill: 'none' },
    React.createElement('path', { d: 'M3 7l9-4 9 4-9 4-9-4z', stroke: '#fff', strokeWidth: 2, strokeLinejoin: 'round' }),
    React.createElement('path', { d: 'M3 12l9 4 9-4M3 17l9 4 9-4', stroke: '#fff', strokeWidth: 2, strokeLinejoin: 'round' })),
};

const META: Record<FeedSource, { label: string; color: string }> = {
  onboarding: { label: 'Your setup', color: '#FB2832' },
  schedule: { label: 'Schedule', color: '#367895' },
  path: { label: 'Your path', color: '#5BA63C' },
  classroom: { label: 'Classroom', color: '#2E6A86' },
  community: { label: 'Community', color: '#5BA63C' },
  certprep: { label: 'Cert Prep', color: '#E8920C' },
  people: { label: 'People', color: '#367895' },
  projects: { label: 'Projects', color: '#FB2832' },
};

function base(source: FeedSource, id: string): Pick<FeedItem, 'id' | 'source' | 'sourceLabel' | 'color' | 'icon' | 'round'> {
  return { id, source, sourceLabel: META[source].label, color: META[source].color, icon: ICONS[source], round: source === 'community' || source === 'people' };
}

export function buildTodayFeed(ctx: TodayFeedCtx, h: TodayFeedHandlers): FeedItem[] {
  const items: FeedItem[] = [];

  if (ctx.ohTitle && !ctx.rsvped) {
    items.push({ ...base('onboarding', 'oh-rsvp'), title: `RSVP to the ${ctx.ohTitle}`, meta: 'Open house',
      when: ctx.ohWhen || undefined, pts: 10, likes: 3,
      desc: 'Show up to meet the team and see the platform. Your first points and a look at what you are joining.',
      cta: { label: 'RSVP', onClick: h.onRsvp, variant: 'cherry' } });
  }

  if (!ctx.hasBackground) {
    items.push({ ...base('onboarding', 'bg-upload'), title: 'Upload your resume or LinkedIn PDF', meta: 'Personalizes your experience', pts: 25, likes: 1,
      desc: "We tailor your program from it in the background. LinkedIn can't be read from a link, so export it to PDF or upload a resume.",
      cta: { label: 'Upload', onClick: h.onUpload, variant: 'cherry' } });
  }

  if (ctx.project) {
    const p = ctx.project;
    const creating = p.status === 'creating';
    items.push({ ...base('projects', 'proj-next'),
      title: creating ? `Building ${p.name}…` : `${p.name} · ${p.nextTaskTitle || 'all tasks done'}`,
      meta: creating ? 'Assembling in the background' : 'Your build · next task', likes: 2,
      desc: creating
        ? 'Your new build is being assembled from your questionnaire. Open Projects to watch its lists and tasks fill in.'
        : 'Pick up your build where you left off. Its lists and tasks live in Projects, in the same feed language as here.',
      cta: { label: 'Open build', to: '/portal/projects', variant: 'cherry' } });
  }

  items.push({ ...base('schedule', 'sch-overview'), title: 'Your 12-week schedule is mapped',
    meta: ctx.firstClassLabel ? `Starts ${ctx.firstClassLabel}` : 'All tasks on one timeline', likes: 6,
    desc: 'Every task from all four tracks — learning, project, internship, and certification — on one calendar.',
    cta: { label: 'Open schedule', to: '/portal/schedule', variant: 'berry' } });

  items.push({ ...base('path', 'path-overview'), title: 'Your path to AI Systems Architect', meta: '12-week spine', likes: 9,
    desc: 'Four intensives are the spine; your project, internship, and certification run as parallel lanes around them.',
    cta: { label: 'See your path', to: '/portal/path', variant: 'leaf' } });

  items.push({ ...base('classroom', 'cl-week1'), title: 'Week 1 · Claude Code Foundations', meta: 'Classroom preview', likes: 5,
    desc: 'Your first week once the cohort starts — a course, a video, a hands-on lab, and a quiz, all scored on-site.',
    cta: { label: 'Preview classroom', to: '/portal/curriculum', variant: 'ghost' } });

  items.push({ ...base('certprep', 'cp-sample'), title: 'CCA-F · Claude Certified Architect prep', meta: 'Cert prep', likes: 4,
    desc: 'Answer prep questions in a feed to build exam readiness across the five domains.',
    cta: { label: 'Coming soon', onClick: () => h.onSoon('Cert Prep'), variant: 'ghost' } });

  items.push({ ...base('community', 'cm-forming'), title: 'Your cohort is forming', meta: 'Community', likes: 8,
    desc: 'Meet your cohort, share builds, and get unblocked. The community feed opens when you enroll.',
    cta: { label: 'Coming soon', onClick: () => h.onSoon('Community'), variant: 'ghost' } });

  return items;
}
