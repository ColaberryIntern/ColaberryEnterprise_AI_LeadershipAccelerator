/**
 * The Agent Factory ladder reader.
 *
 * The two failures these pin are both ones an ad-hoc reader actually shipped:
 *   - asking the LIST for its todos, which returns zero because the list is grouped, and so
 *     reports an empty queue while looking like it worked;
 *   - hand-rolled `?page=N` pagination that stops on the first short page and under-reports.
 * The second is why this delegates to `bcGetAll`, and why a test asserts the delegation rather
 * than just the output.
 */
import fs from 'fs';
import path from 'path';

const mockBcGetAll = jest.fn();
jest.mock('../../services/ops/basecampClient', () => ({
  bcGetAll: (...a: unknown[]) => mockBcGetAll(...a),
}));

import {
  AGENT_FACTORY_BUCKET,
  AGENT_FACTORY_LIST,
  flattenDescription,
  readLadder,
  renderLadder,
} from '../readAgentFactoryLadder';

const group = (id: number, title: string) => ({ id, title });
const todo = (id: number, title: string, over: Record<string, unknown> = {}) => ({
  id, title, completed: false, due_on: '2026-10-24', assignees: [{ name: 'Ali Muwwakkil' }], ...over,
});

/** Answer by URL, the way the real client does, so the test cannot pass by call order. */
function respond(map: Record<string, unknown[]>) {
  mockBcGetAll.mockImplementation(async (url: string) => {
    const hit = Object.keys(map).find((k) => url.includes(k));
    return hit ? map[hit] : [];
  });
}

beforeEach(() => { mockBcGetAll.mockReset(); });

describe('reading the ladder', () => {
  it('walks GROUPS, because asking the list for todos returns zero', async () => {
    respond({
      [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [group(11, '02 - Portal'), group(22, '03 - Agents')],
      '/todolists/11/todos.json': [todo(101, 'AF2.1 - shell')],
      '/todolists/22/todos.json': [todo(202, 'AF3.3 - map')],
    });
    const l = await readLadder();
    expect(l.groupCount).toBe(2);
    expect(l.open.map((t) => t.id)).toEqual([101, 202]);
    expect(l.open.map((t) => t.group)).toEqual(['02 - Portal', '03 - Agents']);

    // The list itself is asked ONLY for its groups, never for todos. That exact call is what
    // returned an empty queue in the ad-hoc reader.
    const urls = mockBcGetAll.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain(`/buckets/${AGENT_FACTORY_BUCKET}/todolists/${AGENT_FACTORY_LIST}/groups.json`);
    expect(urls.some((u) => u === `/buckets/${AGENT_FACTORY_BUCKET}/todolists/${AGENT_FACTORY_LIST}/todos.json`)).toBe(false);
  });

  it('asks for completed todos too, or the completed count is always a lie', async () => {
    respond({ [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [group(11, 'G')], '/todolists/11/todos.json': [] });
    await readLadder();
    const todoUrl = mockBcGetAll.mock.calls.map((c) => String(c[0])).find((u) => u.includes('/todos.json'));
    expect(todoUrl).toContain('status=');
  });

  it('counts completed separately and does not list them as work', async () => {
    respond({
      [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [group(11, 'G')],
      '/todolists/11/todos.json': [
        todo(1, 'open one'),
        todo(2, 'done one', { completed: true }),
        todo(3, 'done two', { completed: true }),
      ],
    });
    const l = await readLadder();
    expect(l.open.map((t) => t.id)).toEqual([1]);
    expect(l.completedCount).toBe(2);
  });

  it('keeps a missing due date as null rather than inventing a placeholder', async () => {
    respond({
      [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [group(11, 'G')],
      '/todolists/11/todos.json': [todo(1, 'x', { due_on: null })],
    });
    expect((await readLadder()).open[0].due).toBeNull();
  });

  it('survives a todo with no assignees and no description', async () => {
    respond({
      [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [group(11, 'G')],
      '/todolists/11/todos.json': [todo(1, 'x', { assignees: undefined, description: undefined })],
    });
    const t = (await readLadder()).open[0];
    expect(t.assignees).toEqual([]);
    expect(t.description).toBe('');
  });

  it('reads an empty board without throwing', async () => {
    respond({ [`/todolists/${AGENT_FACTORY_LIST}/groups.json`]: [] });
    const l = await readLadder();
    expect(l).toEqual({ open: [], completedCount: 0, groupCount: 0 });
  });
});

describe('flattenDescription', () => {
  it('keeps the words and drops the markup', () => {
    expect(flattenDescription('<div>Task <strong>ID</strong>: AF2.7</div>')).toBe('Task ID : AF2.7');
  });

  it('decodes the entities Basecamp actually stores', () => {
    expect(flattenDescription('A &amp; B &nbsp;&ldquo;x&rdquo; &#39;y&#39; &lt;z&gt;'))
      .toBe('A & B "x" \'y\' <z>');
  });

  it('is safe on undefined', () => {
    expect(flattenDescription(undefined)).toBe('');
  });
});

describe('rendering', () => {
  const ladder = {
    open: [{
      id: 10433050218, group: '02 - Portal', title: 'AF2.9 - stale copy',
      due: '2026-10-24', assignees: ['Ali Muwwakkil'], description: 'x'.repeat(400),
    }],
    completedCount: 0,
    groupCount: 1,
  };

  it('leads with the counts', () => {
    expect(renderLadder(ladder)).toContain('1 OPEN  /  0 COMPLETED  /  1 TOTAL');
  });

  /**
   * The load-bearing one. This board reports 0 completed because nobody closes todos on it, and
   * two sessions nearly started tickets whose work had already shipped. The warning has to be
   * in the OUTPUT, not only in a docblock nobody reads at 1am.
   */
  it('warns that 0 completed does not mean the work is undone', () => {
    const out = renderLadder(ladder);
    expect(out).toContain('0 completed');
    expect(out).toMatch(/not\s+evidence the work is undone/);
  });

  it('does NOT warn when the board genuinely has closures', () => {
    // The control: a warning that always prints is wallpaper, and stops being read.
    const out = renderLadder({ ...ladder, completedCount: 4 });
    expect(out).not.toMatch(/not\s+evidence the work is undone/);
  });

  it('truncates a long description and says it did', () => {
    const out = renderLadder(ladder, 50);
    expect(out).toContain(`${'x'.repeat(50)} ...`);
    expect(out).not.toContain('x'.repeat(51));
  });

  it('names an unassigned ticket rather than printing an empty field', () => {
    const out = renderLadder({ ...ladder, open: [{ ...ladder.open[0], assignees: [], due: null }] });
    expect(out).toContain('due NONE');
    expect(out).toContain('UNASSIGNED');
  });
});

/**
 * The guarantee that matters for a script which runs against PRODUCTION Basecamp with Ali's
 * token: it cannot write. Asserted against the source text, because "I only called bcGetAll" is
 * a property of the file, not of any one code path a test happens to exercise.
 */
describe('it is read-only by construction', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'readAgentFactoryLadder.ts'), 'utf8');

  it('imports no mutating Basecamp helper', () => {
    expect(source).toMatch(/import \{ bcGetAll \} from '\.\.\/services\/ops\/basecampClient'/);
    expect(source).not.toMatch(/bcPost|bcPut|bcDelete/);
  });

  it('issues no write verb of its own', () => {
    expect(source).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    expect(source).not.toMatch(/completed:\s*true/);
  });

  it('and the scan can see this file', () => {
    // Without this a wrong path reads '' and both assertions above pass vacuously.
    expect(source).toContain('export async function readLadder');
  });
});
