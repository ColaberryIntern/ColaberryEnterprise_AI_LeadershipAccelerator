import { departuresBoard, projectRoute, DEPARTURES_MAX, type StudioProjectFacts } from '../interior/departures';
import type { StudentProject } from '../../../pages/portal/projects/projectsStore';

/**
 * C85: the Project Studio's left wall is DEPARTURES: one row per project, last worked first (the server's last_worked_at), each a
 * button into that project's next task; the last commit when one is recorded, else the next task. Never an invented row.
 */
const proj = (id: string, name: string, title = 'User selects location', extra: Partial<StudentProject> = {}): StudentProject => ({
  id, name, sample: false, lists: [{ id: 'r0', name: 'Release 0', tasks: [
    { id: `${id}-t1`, storyId: 'STORY-001', title, what: '', state: 'todo', points: 50, prompt: '', due: 'today' },
  ] }], ...extra,
} as unknown as StudentProject);
const facts = (rows: StudioProjectFacts[]) => new Map(rows.map((r) => [r.id, r]));
const NOW = Date.parse('2026-10-31T17:00:00Z');

describe('Departures board (C85)', () => {
  const test = proj('p-test', 'My Test Project');
  const pulse = proj('p-pulse', 'PropertyPulse AI', 'Add the map view');

  it('one project (every member has the test project): one row, a button into its next task', () => {
    const b = departuresBoard([test], null, NOW);
    expect(b.title).toContain('Departures');
    expect(b.note).toBe('Your projects, last worked first');
    expect(b.open).toBe('See all my projects');
    expect(b.rows).toEqual([{ label: 'My Test Project', value: 'Open', route: '/portal/projects/workspace/p-test/STORY-001' }]);
  });

  it('orders by last worked, newest first, and shows how long ago, never a commit sha or story text (they crowded the name off the row)', () => {
    const b = departuresBoard([test, pulse], facts([
      { id: 'p-test', last_commit: null, last_worked_at: '2026-10-20T12:00:00Z' },
      { id: 'p-pulse', last_commit: { sha: 'abcdef1', message: 'Map view', at: '2026-10-31T15:00:00Z' }, last_worked_at: '2026-10-31T15:00:00Z' },
    ]), NOW);
    expect(b.rows.map((r) => r.label)).toEqual(['PropertyPulse AI', 'My Test Project']);
    expect(b.rows[0].value).toBe('2h ago');
    expect(b.rows[1].value).toBe('Oct 20');
    expect(b.rows[0].route).toBe('/portal/projects/workspace/p-pulse/STORY-001');
  });

  it('a project the server has no time for goes after the timed ones, in list order', () => {
    const third = proj('p-3', 'Third');
    const b = departuresBoard([third, test, pulse], facts([{ id: 'p-pulse', last_commit: null, last_worked_at: '2026-10-30T00:00:00Z' }]), NOW);
    expect(b.rows.map((r) => r.label)).toEqual(['PropertyPulse AI', 'Third', 'My Test Project']);
  });

  it('matches a local build to its server row by the backend id it stands in for', () => {
    const local = proj('p-local', 'Local build', 'X', { pipelineProjectId: 'srv-1' });
    const b = departuresBoard([test, local], facts([{ id: 'srv-1', last_commit: null, last_worked_at: '2026-10-31T00:00:00Z' }]), NOW);
    expect(b.rows[0].label).toBe('Local build');
  });

  it('six or more projects: the newest four, two builds with one name keep two rows', () => {
    const many = Array.from({ length: 7 }, (_, i) => proj(`p${i}`, i < 2 ? 'Same name' : `Build ${i}`));
    const b = departuresBoard(many, null, NOW);
    expect(b.rows).toHaveLength(DEPARTURES_MAX);
    expect(b.rows.slice(0, 2).map((r) => r.label)).toEqual(['Same name', 'Same name (2)']);
    expect(new Set(b.rows.map((r) => r.label)).size).toBe(DEPARTURES_MAX);
  });

  it('a project with no next task opens the Projects page', () => {
    const done = { ...test, lists: [] } as unknown as StudentProject;
    expect(projectRoute(done)).toBe('/portal/projects');
    expect(departuresBoard([done], null, NOW).rows[0]).toEqual({ label: 'My Test Project', value: 'Open', route: '/portal/projects' });
  });

  it('the list failed to load: the board still stands with its empty line', () => {
    const b = departuresBoard([], null, NOW);
    expect(b.rows).toEqual([]);
    expect(b.empty).toBe('Your projects could not be loaded');
  });
});
