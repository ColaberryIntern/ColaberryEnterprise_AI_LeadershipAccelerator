import { classroomSummary, projectsSummary, certPrepSummary, plainSummary } from '../interior/pageSummary';
import type { ClassroomFeed } from '../interior/pageSummary';
import type { TimelineFeedCard } from '../../timeline/TimelineCard';
import type { StudentProject } from '../../../pages/portal/projects/projectsStore';
import type { CertReadiness, CertDomain } from '../../../services/certPrepApi';

/**
 * Campus v6 D1 / v3 §2.1: the room's board shows exactly what the building's page shows as its Next step, and the spot opens that
 * card's workstation. Built from the same data the pages read; nothing invented.
 */
const card = (o: Partial<TimelineFeedCard>): TimelineFeedCard => ({ id: 'c1', week: 1, bucket: 'learn', order: 1, status: 'not_started', title: 'Getting Started with Claude Code',
  subtitle: 'Introductory Guide', student_label: 'Video', points: { learning: 10, builder: 0, community: 0 }, ...o } as unknown as TimelineFeedCard);

describe('Classroom', () => {
  const feed: ClassroomFeed = { buckets: ['pre_class', 'learn'], cards: [card({ id: 'done', status: 'completed', order: 0 }), card({})],
    progression: { xp: { learning: 115, builder: 53, community: 11 }, level: { slug: 'builder', readiness: 0.25 }, band: { rungName: 'AI Enabled II' } } };

  it('the week\'s next card is the board; "Your status" the wall board; the card\'s runtime the workstation; "Week N" the section', () => {
    const s = classroomSummary(feed);
    expect(s.next).toEqual({ kicker: 'Your next step · Video', points: 10, title: 'Getting Started with Claude Code', sub: 'Introductory Guide', cta: 'Open' });
    expect(s.card).toBe('/portal/runtime/c1');
    expect(s.doorName).toBe('Week 1');
    expect(s.sideTop!.title).toBe('Your status');
    expect(s.sideTop!.rows.map((r) => [r.label, r.value])).toEqual([['Level', 'AI Enabled II'], ['Architect readiness', '25%'], ['Builder XP', '53'], ['Learning XP', '115'], ['Community XP', '11']]);
  });

  it('all caught up: no Next step, no workstation (the room shows the plan step or a plain sign)', () => {
    const s = classroomSummary({ ...feed, cards: [card({ status: 'completed' })] });
    expect(s.next).toBeNull();
    expect(s.card).toBeNull();
  });
});

describe('Projects', () => {
  const project = { id: 'p1', name: 'PropertyPulse AI', sample: false, lists: [{ id: 'r0', name: 'Release 0', tasks: [
    { id: 't1', storyId: 'STORY-001', title: 'User selects location', what: 'As an investor…', state: 'todo', points: 50, prompt: 'Implement STORY-001', due: 'today' },
  ] }] } as unknown as StudentProject;

  it('the next story of the first build, "Build · +50 pts", Copy prompt with the prompt, and its workspace URL', () => {
    const s = projectsSummary([project]);
    expect(s.next).toMatchObject({ kicker: 'Your next step · PropertyPulse AI', title: 'User selects location', cta: 'Build · +50 pts', secondary: { label: 'Copy prompt', copy: 'Implement STORY-001' } });
    expect(s.card).toBe('/portal/projects/workspace/p1/STORY-001');
    expect(s.sideTop!.rows[0]).toEqual({ label: 'Active builds', value: '1' });
  });

  it('no build: no Next step, no workstation; the sample build is not counted as yours', () => {
    const s = projectsSummary([{ ...project, sample: true } as StudentProject]);
    expect(s.sideTop!.rows[0].value).toBe('0');
    expect(projectsSummary([]).next).toBeNull();
    expect(projectsSummary([]).card).toBeNull();
  });
});

describe('Cert Prep: the diagnostic or practice, never a knowledge check (Ali 2026-10-24)', () => {
  const domains = [{ domain_id: 'd1', label: 'Agentic Architecture' }, { domain_id: 'd2', label: 'Tool Design & MCP' }] as unknown as CertDomain[];
  const r = (o: Partial<CertReadiness>) => ({ overall_state: 'approaching', domain_breakdown: [{ domain_id: 'd1', answered: 2, knowledge_pct: 0.5 }, { domain_id: 'd2', answered: 0, knowledge_pct: null }], ...o } as unknown as CertReadiness);

  it('not measured: "Start with the baseline diagnostic"', () => {
    const s = certPrepSummary(null, domains);
    expect(s.next).toMatchObject({ title: 'Start with the baseline diagnostic', cta: 'Take the baseline diagnostic' });
    expect(s.card).toBe('/portal/cert-prep');
  });

  it('measured: practise the untouched domain first; the wall board counts answers and domains', () => {
    const s = certPrepSummary(r({}), domains);
    expect(s.next!.title).toBe('Practise Tool Design & MCP');
    expect(s.sideTop!.rows).toEqual([{ label: 'Questions answered', value: '2' }, { label: 'Domains attempted', value: '1 of 2' }]);
    expect(JSON.stringify(s)).not.toMatch(/knowledge check/i);
  });
});

it('a page with no Next step of its own gives only its section name', () => {
  expect(plainSummary('Library')).toEqual({ next: null, sideTop: null, card: null, doorName: 'Library' });
});
