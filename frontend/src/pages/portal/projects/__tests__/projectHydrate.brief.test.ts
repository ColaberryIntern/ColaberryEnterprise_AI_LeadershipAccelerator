import {
  overlayCompletions, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

/**
 * THE BRIEF MUST WIN OVER THE COLUMN THAT HOLDS A COPY OF THE TITLE.
 *
 * ── The Tashima case, 13 November 2026 ───────────────────────────────────────
 *
 * She wrote in to say the STORY-000 prompt told her to "read the brief above this prompt
 * on the story page", and that there was no brief there, so she had been leaving her
 * domain's counts, accountable human and employee blank.
 *
 * She was right, and nothing she could do would have fixed it. On agent-domain boards
 * `agentDomainProvisioner.ts` binds `s.title` into BOTH `title` and `description`, so
 * `description` is a ~40-character copy of the title. The real brief -- 1,253 characters
 * naming her domain, her employee, her accountable human and every count -- lives in
 * `narrative`, which this module did not carry and the portal DTO did not serve. The
 * workspace page rendered `description`, so she saw the title printed twice and then a
 * prompt referring to a brief that had never crossed the wire. The prompt deliberately
 * omits those figures so there is exactly one copy of each, and that copy was unreachable.
 *
 * So the rule under test is an ORDER, not a field: prefer `narrative`, fall back to
 * `description`. A test that merely asserted "narrative is carried" would pass against a
 * build that still preferred the title copy, which is the bug.
 */

const localTask = (over: Partial<ProjectTask> = {}): ProjectTask => ({
  id: 't1', title: 'STORY-000', storyId: 'STORY-000', state: 'todo', due: 'up', ...over,
});

const localProject = (tasks: ProjectTask[]): StudentProject => ({
  id: 'p1', name: 'My Build', slug: 'my-build', descriptor: '', accent: '#000', cover: '', icon: '',
  status: 'ready', createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  reqs: [], lists: [{ id: 'p1-L1', step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: 'My Build', summary: '', tools: [], dataSources: [], guardrails: [] },
});

const bTask = (over: Partial<BackendTaskNode> = {}): BackendTaskNode => ({
  id: 'uuid-STORY-000', story_id: 'STORY-000', requirement_key: null, title: 'STORY-000',
  description: null, status: 'not_started', position: 0, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [], ...over,
});

const bTree = (tasks: BackendTaskNode[]): BackendProjectTree => ({
  id: 'proj-uuid', name: 'My Build', organization_name: null,
  lists: [{ id: 'p1-L1', title: 'L1', position: 0, tasks }],
});

const story = (p: StudentProject, storyId = 'STORY-000') =>
  p.lists.flatMap((l) => l.tasks).find((t) => t.storyId === storyId) as ProjectTask;

// Shortened from the real internship.STORY-000 row, which is 1,253 characters.
const BRIEF = 'Build one page that shows what you are building and how far along it is.\n\n'
  + '**Your domain** is Internship & Career Readiness (`internship`). **Your accountable human** '
  + 'is Dhee.\n\n**The scope you are being handed:** 35 researched capabilities.';

// What the provisioner actually puts in `description`: the title, again.
const TITLE_COPY = 'STORY-000 - Build your Command Center';

describe('the Tashima case — the brief was never reaching the page', () => {
  it('prefers the brief over a description that is a copy of the title', () => {
    const next = backendTreeToProject(bTree([bTask({
      title: TITLE_COPY, description: TITLE_COPY, narrative: BRIEF,
    })]));

    expect(story(next).what).toBe(BRIEF);
    // The precise failure she reported: the title rendered where the brief belongs.
    expect(story(next).what).not.toBe(TITLE_COPY);
  });

  it('adopts the brief onto a device that already holds the story', () => {
    // She had opened this story before, so her copy was already in local storage. A fix
    // that only worked on a first load would not have reached her.
    const local = localProject([localTask({ what: TITLE_COPY })]);
    const next = overlayCompletions(local, bTree([bTask({
      title: TITLE_COPY, description: TITLE_COPY, narrative: BRIEF,
    })]));

    expect(story(next).what).toBe(BRIEF);
  });

  it('falls back to description when there is no brief', () => {
    // SBP boards write the same text into both columns, and older rows have narrative
    // null. Preferring narrative must not blank the body for them.
    const next = backendTreeToProject(bTree([bTask({
      description: 'Expose the project tree over MCP', narrative: null,
    })]));

    expect(story(next).what).toBe('Expose the project tree over MCP');
  });

  it('leaves the body undefined when the server holds neither', () => {
    // The page renders the title in this case; it must not render the string "null".
    const next = backendTreeToProject(bTree([bTask({ description: null })]));

    expect(story(next).what).toBeUndefined();
  });

  it('POSITIVE CONTROL: an older server that sends no narrative still shows its description', () => {
    // Proves these tests measure the ORDER rather than passing because `what` is always
    // set from narrative. `narrative` is absent from the payload entirely here, which is
    // what a backend deployed before this change sends.
    const node = bTask({ description: 'Older server body' });
    delete (node as { narrative?: unknown }).narrative;
    const next = backendTreeToProject(bTree([node]));

    expect(story(next).what).toBe('Older server body');
  });
});
