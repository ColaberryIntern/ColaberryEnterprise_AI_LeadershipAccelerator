/**
 * Reading one Basecamp todo in full.
 *
 * The defect this exists for: the ladder lister truncates descriptions to 300 chars, and the
 * Agent Factory bodies open with ~250 chars of identical filing boilerplate, so a truncated read
 * of a P0 contains no requirement at all. These tests pin the two things that make the full read
 * worth having -- paragraph structure survives, and comments are paginated -- plus the read-only
 * guarantee, since this runs against production Basecamp with Ali's token.
 */
import fs from 'fs';
import path from 'path';

const mockBcGet = jest.fn();
const mockBcGetAll = jest.fn();
jest.mock('../../services/ops/basecampClient', () => ({
  bcGet: (...a: unknown[]) => mockBcGet(...a),
  bcGetAll: (...a: unknown[]) => mockBcGetAll(...a),
}));

import { htmlToText, readTicket, renderTicket } from '../readBasecampTicket';

const TODO = {
  id: 10406234458,
  title: 'AF3.3 - The consolidation map',
  completed: false,
  due_on: '2026-10-18',
  app_url: 'https://app.basecamp.com/3945211/buckets/7463955/todos/10406234458',
  assignees: [{ name: 'Ali Muwwakkil' }],
  description: '<div>Priority: P0</div><div><strong>OBJECTIVE</strong></div><div>Map them.</div>',
};

beforeEach(() => {
  mockBcGet.mockReset();
  mockBcGetAll.mockReset();
  mockBcGet.mockResolvedValue(TODO);
  mockBcGetAll.mockResolvedValue([]);
});

describe('readTicket', () => {
  it('asks for the todo and its comments, by id', async () => {
    await readTicket(10406234458, 7463955);
    expect(String(mockBcGet.mock.calls[0][0])).toBe('/buckets/7463955/todos/10406234458.json');
    expect(String(mockBcGetAll.mock.calls[0][0])).toBe('/buckets/7463955/recordings/10406234458/comments.json');
  });

  /**
   * Comments go through bcGetAll, not bcGet. A long-running ticket's comments run past page one,
   * and the LATEST comment is usually the one that changed what the work is -- so a first-page-only
   * read can describe work that was already renegotiated.
   */
  it('paginates the comments rather than reading only page one', async () => {
    mockBcGetAll.mockResolvedValue([
      { id: 1, created_at: '2026-10-20T10:00:00Z', creator: { name: 'Ali' }, content: '<div>first</div>' },
      { id: 2, created_at: '2026-10-21T10:00:00Z', creator: { name: 'Kes' }, content: '<div>second</div>' },
    ]);
    const t = await readTicket(1);
    expect(t.comments.map((c) => c.text)).toEqual(['first', 'second']);
    expect(t.comments.map((c) => c.author)).toEqual(['Ali', 'Kes']);
  });

  it('carries the fields a reader needs to judge the ticket', async () => {
    const t = await readTicket(10406234458);
    expect(t.title).toContain('AF3.3');
    expect(t.due).toBe('2026-10-18');
    expect(t.assignees).toEqual(['Ali Muwwakkil']);
    expect(t.url).toContain('/todos/10406234458');
    expect(t.description).toContain('OBJECTIVE');
  });

  it('keeps a missing due date as null and survives no assignees', async () => {
    mockBcGet.mockResolvedValue({ ...TODO, due_on: null, assignees: undefined, app_url: undefined });
    const t = await readTicket(1);
    expect(t.due).toBeNull();
    expect(t.assignees).toEqual([]);
    expect(t.url).toBe('');
  });

  it('survives a ticket with no comments and no description', async () => {
    mockBcGet.mockResolvedValue({ ...TODO, description: undefined });
    const t = await readTicket(1);
    expect(t.comments).toEqual([]);
    expect(t.description).toBe('');
  });
});

describe('htmlToText', () => {
  /**
   * THE LOAD-BEARING ONE. The list view flattens to a single line on purpose; doing that here
   * would glue "OBJECTIVE" onto the sentence before it and turn a structured ticket -- objective,
   * acceptance criteria, inputs -- into one run-on wall. The structure is most of the information.
   */
  it('keeps paragraph breaks instead of flattening to one line', () => {
    const out = htmlToText('<div>Line one</div><div>Line two</div>');
    expect(out).toBe('Line one\nLine two');
    expect(out).toContain('\n');
  });

  it('renders list items as bullets, evenly aligned', () => {
    // Evenly: an indented "  - " loses a space to the whitespace collapse on every line but the
    // first, which is how the first version produced a ragged list.
    expect(htmlToText('<ul><li>alpha</li><li>beta</li></ul>')).toBe('- alpha\n- beta');
  });

  it('collapses a run of blank lines but does not join paragraphs', () => {
    expect(htmlToText('<div>a</div><br><br><br><div>b</div>')).toBe('a\n\nb');
  });

  it('decodes the entities Basecamp stores', () => {
    expect(htmlToText('A &amp; B &ldquo;q&rdquo; &#39;s&#39; &lt;t&gt;')).toBe('A & B "q" \'s\' <t>');
  });

  it('is safe on undefined', () => {
    expect(htmlToText(undefined)).toBe('');
  });
});

describe('renderTicket', () => {
  it('leads with the id, title and state, then the full description', async () => {
    const out = renderTicket(await readTicket(10406234458));
    expect(out).toMatch(/^#10406234458 {2}AF3\.3/);
    expect(out).toContain('completed=false');
    expect(out).toContain('--- description ---');
    expect(out).toContain('OBJECTIVE');
  });

  it('does NOT truncate the description', async () => {
    // The whole reason this script exists. 1,200 chars must all survive.
    const long = 'y'.repeat(1200);
    mockBcGet.mockResolvedValue({ ...TODO, description: `<div>${long}</div>` });
    const out = renderTicket(await readTicket(1));
    expect(out).toContain(long);
    expect(out).not.toContain('...');
  });

  it('says so when there are no comments', async () => {
    expect(renderTicket(await readTicket(1))).toContain('--- 0 comment(s) ---');
  });

  it('attributes each comment to its author and time', async () => {
    mockBcGetAll.mockResolvedValue([
      { id: 1, created_at: '2026-10-20T10:00:00Z', creator: { name: 'Kes' }, content: 'scope changed' },
    ]);
    const out = renderTicket(await readTicket(1));
    expect(out).toContain('--- 1 comment(s) ---');
    expect(out).toContain('[2026-10-20T10:00:00Z] Kes');
    expect(out).toContain('scope changed');
  });
});

/** It runs against production Basecamp with Ali's token, so it must not be able to write. */
describe('it is read-only by construction', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'readBasecampTicket.ts'), 'utf8');

  it('imports no mutating Basecamp helper', () => {
    expect(source).not.toMatch(/bcPost|bcPut|bcDelete/);
  });

  it('issues no write verb of its own', () => {
    expect(source).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)['"]/i);
    expect(source).not.toMatch(/completed:\s*true/);
  });

  it('and the scan can see this file', () => {
    expect(source).toContain('export async function readTicket');
  });
});
