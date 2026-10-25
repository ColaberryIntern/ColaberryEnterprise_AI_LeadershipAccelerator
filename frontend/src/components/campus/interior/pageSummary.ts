import type { TimelineFeedCard } from '../../timeline/TimelineCard';
import { findActiveNextCard, sumCardPoints } from '../../../pages/portal/classroomNextStep';
import type { StudentProject } from '../../../pages/portal/projects/projectsStore';
import { nextTask, projectPoints } from '../../../pages/portal/projects/projectsStore';
import { isPrepStory, DEMO_DAY_STORY_ID } from '../../../pages/portal/projects/DemoEvidencePanel';
import type { CertDomain, CertReadiness } from '../../../services/certPrepApi';
import { certPrepNextAction } from '../../../pages/portal/certprep/certPrepNextAction';

/**
 * One source for a building's page and its room (v3 §2.1 usePageSummary, v6 D1): what the page shows as its Next step is what the
 * back-wall screen ("the board") shows; the card to the right of it is the left-wall board; `card` is what "your spot" and the
 * screen's primary button open (the workstation for that card); `doorName` names the section ("See all of ‹doorName›").
 * Pure builders over the data each page already reads, so a page and its room cannot disagree. Nothing is invented: no data, no
 * Next step (the room then shows the building's plan step, or a plain sign).
 */
/** secondary: a copy button (Projects "Copy prompt"): its label and the text it copies. */
export interface PageNext { kicker: string; points: number; title: string; sub: string | null; cta: string; secondary?: { label: string; copy: string } | null }
export interface SideRow { label: string; value: string; pct?: number }
export interface SideTop { title: string; rows: SideRow[] }
export interface PageSummary { next: PageNext | null; sideTop: SideTop | null; card: string | null; doorName: string }

/** Classroom: the week's next card (the same default week the page opens on), "Your status", and that card's runtime. */
export interface ClassroomFeed {
  buckets: string[];
  cards: TimelineFeedCard[];
  progression?: { xp: { learning: number; builder: number; community: number }; level: { slug: string; readiness: number }; band?: { rungName?: string } };
}
const titleCase = (s: string): string => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export function classroomSummary(feed: ClassroomFeed): PageSummary {
  const card = findActiveNextCard(feed.cards, feed.buckets);
  const prog = feed.progression;
  const readiness = prog ? Math.round(prog.level.readiness * 100) : 0;
  return {
    next: card ? { kicker: `Your next step · ${card.student_label}`, points: sumCardPoints(card.points), title: card.title, sub: card.subtitle ?? null, cta: 'Open' } : null,
    sideTop: prog ? { title: 'Your status', rows: [
      { label: 'Level', value: prog.band?.rungName ?? titleCase(prog.level.slug) },
      { label: 'Architect readiness', value: `${readiness}%`, pct: readiness },
      { label: 'Builder XP', value: String(prog.xp.builder) },
      { label: 'Learning XP', value: String(prog.xp.learning) },
      { label: 'Community XP', value: String(prog.xp.community) },
    ] } : null,
    card: card ? `/portal/runtime/${card.id}` : null,
    doorName: card?.week != null ? `Week ${card.week}` : 'Classroom',
  };
}

/** Projects: the next task of your first build (ProjectsNextStepHero), "Your builds", and that task's workspace. */
export function projectsSummary(projects: StudentProject[]): PageSummary {
  const primary = projects[0];
  const n = primary ? nextTask(primary) : null;
  const own = projects.filter((p) => !p.sample);
  const pts = n?.task.points ?? 0;
  const verb = n?.task.storyId === DEMO_DAY_STORY_ID ? 'Demo Day' : isPrepStory(n?.task.storyId) ? 'Submit' : 'Build';
  const key = n ? n.task.storyId || n.task.id : null;
  const earned = own.reduce((a, p) => a + projectPoints(p).earned, 0), available = own.reduce((a, p) => a + projectPoints(p).available, 0);
  return {
    next: primary && n ? { kicker: `Your next step · ${primary.name}`, points: pts, title: n.task.title, sub: n.task.what || null,
      cta: pts > 0 ? `${verb} · +${pts} pts` : 'Open', secondary: n.task.prompt ? { label: 'Copy prompt', copy: n.task.prompt } : null } : null,
    sideTop: { title: 'Your builds', rows: [{ label: 'Active builds', value: String(own.length) }, { label: 'Build points', value: `${earned}/${available}` }] },
    card: primary && key ? `/portal/projects/workspace/${primary.id}/${encodeURIComponent(key)}` : null,
    doorName: 'Projects',
  };
}

/** Cert Prep: the diagnostic or a practice set (certPrepNextAction, never a knowledge check), "Your progress"; it runs on the page. */
export function certPrepSummary(readiness: CertReadiness | null, domains: CertDomain[]): PageSummary {
  const a = certPrepNextAction(readiness, domains);
  const measured = !!readiness && readiness.overall_state !== 'not_measured';
  const answered = readiness ? readiness.domain_breakdown.reduce((s, d) => s + d.answered, 0) : 0;
  const attempted = readiness ? readiness.domain_breakdown.filter((d) => d.answered > 0).length : 0;
  return {
    next: { kicker: measured ? 'Your next practice' : 'Not measured yet', points: 0,
      title: measured ? a.label : 'Start with the baseline diagnostic',
      sub: measured ? 'Practice your weakest domain to move your readiness' : 'Take the baseline diagnostic to create your first readiness picture', cta: a.label },
    sideTop: readiness ? { title: 'Your progress', rows: [
      { label: 'Questions answered', value: String(answered) },
      { label: 'Domains attempted', value: `${attempted} of ${readiness.domain_breakdown.length}` },
    ] } : null,
    card: '/portal/cert-prep',
    doorName: 'Cert Prep',
  };
}

/** A page with no Next step of its own (Library, Meeting Rooms, Game Room): the board shows the plan step or a plain sign. */
export const plainSummary = (doorName: string): PageSummary => ({ next: null, sideTop: null, card: null, doorName });
