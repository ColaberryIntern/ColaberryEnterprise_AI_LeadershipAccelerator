import { composeInternshipPortfolio } from '../compose';
import { DUE_SOON_DAYS, presentationAsk, presentationDue, videoArtifacts } from '../presentations';
import { renderInternshipPortfolio } from '../render';
import { buildSidecar } from '../sidecar/build';
import type { PrepTask, RecordedVideo } from '../types';
import { NOW, collected, daysAgo } from './fixtures';

const DAY = 86400000;
const iso = (d: number): string => new Date(NOW.getTime() + d * DAY).toISOString().slice(0, 10);
const task = (storyId: string, dueIn: number, over: Partial<PrepTask> = {}): PrepTask => ({ enrollment_id: 'e1', story_id: storyId, title: `${storyId} task`, status: 'not_started', due_on: iso(dueIn), verified_at: null, ...over });
const video = (over: Partial<RecordedVideo> = {}): RecordedVideo => ({
  recording_id: '588ada68-4795-4411-8cde-3b064f00045a', enrollment_id: 'e1', story_id: 'PREP-1', presentation_type: 'project_introduction', template_slug: 'project_introduction',
  duration_seconds: 71, created_at: daysAgo(2), attempt_no: 1, mode: 'practice_solo', is_final_take: false, has_audio: true, has_shared_screen: false, ...over,
});
const ladder = (dueIn: number[]): PrepTask[] => ['PREP-1', 'PREP-2', 'PREP-3', 'PREP-4', 'PREP-5', 'PREP-6'].map((s, i) => task(s, dueIn[i]));

describe('presentations: demo videos are artifacts that open the video viewer', () => {
  it('a recording becomes a video artifact titled by its presentation type and length', () => {
    const [a] = videoArtifacts('e1', [video(), video({ enrollment_id: 'someone-else' })]);
    expect(a).toEqual(expect.objectContaining({
      id: '588ada68-4795-4411-8cde-3b064f00045a', kind: 'presentation', title: 'Project introduction (1:11)', source: 'recording', fileType: 'video',
      url: 'https://enterprise.colaberry.ai/admin/internship/video/588ada68-4795-4411-8cde-3b064f00045a',
      provenance: 'Presentation Studio, PREP-1, take 1',
    }));
    expect(videoArtifacts('e1', [video()])).toHaveLength(1);
  });

  it('shows in the report as a Video group listed first, and as project evidence in the JSON', () => {
    const d = collected({ videos: [video()], artifacts: [] });
    const report = composeInternshipPortfolio(d, { now: NOW });
    const html = renderInternshipPortfolio(report).html;
    expect(html).toMatch(/&#127909; Video 1<\/span>.*Project introduction \(1:11\)/s);
    expect(html).toContain('href="https://enterprise.colaberry.ai/admin/internship/video/588ada68-4795-4411-8cde-3b064f00045a" target="_blank"');
    const s = buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
    expect(s.interns[0].artifacts[0]).toEqual(expect.objectContaining({ file_type: 'video', classification: 'project_artifact', source: 'recording' }));
  });
});

describe('presentations: the next presentation, at the right time (their own PREP due dates)', () => {
  it('nothing is asked while the next presentation is more than a week away', () => {
    expect(presentationDue('e1', ladder([DUE_SOON_DAYS + 3, 20, 21, 22, 23, 30]), [], NOW.getTime())).toBeNull();
  });

  it('due within a week: the lowest PREP task not done, with the days until due', () => {
    const d = presentationDue('e1', ladder([3, 20, 21, 22, 23, 30]), [], NOW.getTime())!;
    expect(d).toEqual(expect.objectContaining({ storyId: 'PREP-1', typeId: 'project_introduction', label: 'Project introduction', daysLate: -3, demoDay: false }));
  });

  it('skips tasks that are verified and types already recorded, and reports how late the next one is', () => {
    const tasks = ladder([-30, -20, -10, 5, 9, 15]);
    tasks[0].verified_at = daysAgo(25);
    const d = presentationDue('e1', tasks, [video({ presentation_type: 'working_system_demo', story_id: 'PREP-2' })], NOW.getTime())!;
    expect(d.storyId).toBe('PREP-3');
    expect(d.daysLate).toBe(10);
  });

  it('with all five recorded, Demo Day comes up when it is close', () => {
    const tasks = ladder([-30, -29, -28, -27, -26, 4]).map((t, i) => (i < 5 ? { ...t, status: 'complete' } : t));
    expect(presentationDue('e1', tasks, [], NOW.getTime())).toEqual(expect.objectContaining({ storyId: 'PREP-6', demoDay: true, label: 'Demo Day' }));
  });

  it('the ask names the type, its timing and its real talk track, and the nudge says when', () => {
    const d = presentationDue('e1', ladder([-4, 20, 21, 22, 23, 30]), [], NOW.getTime())!;
    const a = presentationAsk('Kalkidan', 'Admissions', d);
    expect(a.key).toBe('presentation_prep_1');
    expect(a.name).toBe('Record your Project introduction');
    expect(a.why).toMatch(/was due 4 days ago/);
    expect(a.prompt).toContain('Target length: 1.5 minutes');
    expect(a.prompt).toContain('- The person and their problem (20s):');
    expect(a.prompt).toContain('Save as PDF');
    expect(a.nudge).toMatch(/^Hi Kalkidan, your Project introduction \(PREP-1\) was due 4 days ago/);
    expect(a.nudge).toContain('Presentation Studio');
  });

  it('the report asks for it right after a Blocker Brief, and the tour flags it when overdue', () => {
    const d = collected({ prepTasks: ladder([-12, 20, 21, 22, 23, 30]), videos: [] });
    d.projects[0].commits = [{ sha: 'a', date: daysAgo(1), author: 'kal', message: 'x' }];
    const report = composeInternshipPortfolio(d, { now: NOW });
    const c = report.groups[0].interns[0];
    expect(c.artifacts.asks[0].key).toBe('presentation_prep_1');
    const s = buildSidecar(report, { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
    expect(s.highlights.find((h) => h.kind === 'presentation')?.title).toBe("Kalkidan's Project introduction is 12 days overdue");
  });

  it('a newly recorded video is good news on the tour', () => {
    const s = buildSidecar(composeInternshipPortfolio(collected({ videos: [video()] }), { now: NOW }), { reportDate: '2026-11-09', previous: null, lastOutbound: [] });
    expect(s.highlights.find((h) => h.kind === 'new_video')?.title).toBe('Kalkidan recorded a Project introduction');
  });
});
