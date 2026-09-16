import { authoredToImportLists, type AuthoredRelease } from '../internshipProjectAuthoring';

// authoredToImportLists is the pure shaping step: authored releases/stories ->
// importProject lists. No database is touched.
const releases: AuthoredRelease[] = [
  {
    key: 'r0', name: 'Release 0 - Setup',
    stories: [
      { title: 'Stand up the repo', narrative: 'Create the project skeleton', build: 'run: npx create...' },
      { title: 'Wire CI' },
    ],
  },
  {
    key: 'r1', name: 'Release 1 - Core',
    stories: [{ title: 'Build the pipeline', acceptance: ['Given data, when run, then rows land'] }],
  },
];

describe('authoredToImportLists', () => {
  it('makes one list per release, keyed by the release key', () => {
    const lists = authoredToImportLists(releases);
    expect(lists.map((l) => l.cluster)).toEqual(['r0', 'r1']);
    expect(lists.map((l) => l.title)).toEqual(['Release 0 - Setup', 'Release 1 - Core']);
    expect(lists.map((l) => l.position)).toEqual([0, 1]);
  });

  it('numbers story ids globally and sequentially across releases', () => {
    const lists = authoredToImportLists(releases);
    const ids = lists.flatMap((l) => l.tasks.map((t) => t.story_id));
    expect(ids).toEqual(['STORY-001', 'STORY-002', 'STORY-003']);
  });

  it('carries narrative, build, acceptance and stamps the release_key', () => {
    const [r0] = authoredToImportLists(releases);
    expect(r0.tasks[0]).toMatchObject({
      title: 'Stand up the repo',
      description: 'Create the project skeleton',
      build: 'run: npx create...',
      release_key: 'r0',
      status: 'not_started',
    });
    expect(authoredToImportLists(releases)[1].tasks[0].acceptance).toEqual(['Given data, when run, then rows land']);
  });

  it('always starts stories not_started (authoring never mints completion)', () => {
    const lists = authoredToImportLists(releases);
    expect(lists.flatMap((l) => l.tasks).every((t) => t.status === 'not_started')).toBe(true);
  });

  it('defaults a missing release name to its key and missing gating to empty', () => {
    const lists = authoredToImportLists([{ key: 'r2', name: '', stories: [{ title: 'x' }] }]);
    expect(lists[0].title).toBe('r2');
    expect(lists[0].tasks[0].blocked_by).toEqual([]);
  });
});
