/**
 * W29 (Ali, 2026-11-20): "each client gets their own list in a NEW Colaberry Enterprise Intake
 * project in BC... checklist." Q4 A: Ali owns every list. Every to-do has an owner and a due date.
 */
const mockEnv: Record<string, unknown> = {};
const mockBcGet = jest.fn();
const mockBcGetAll = jest.fn();
const mockBcPost = jest.fn();
const mockFindByPk = jest.fn();
const mockFindAll = jest.fn();
const mockStaticUpdate = jest.fn();
const mockRecordFind = jest.fn();

jest.mock('../../../config/env', () => ({ env: mockEnv }));
jest.mock('../../ops/basecampClient', () => ({
  bcGet: (...a: any[]) => mockBcGet(...a),
  bcGetAll: (...a: any[]) => mockBcGetAll(...a),
  bcPost: (...a: any[]) => mockBcPost(...a),
}));
jest.mock('../../../models/EnterpriseIntake', () => ({
  __esModule: true,
  default: {
    findByPk: (...a: any[]) => mockFindByPk(...a),
    findAll: (...a: any[]) => mockFindAll(...a),
    update: (...a: any[]) => mockStaticUpdate(...a),
  },
}));
jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findByPk: (...a: any[]) => mockRecordFind(...a) },
}));

/* eslint-disable import/first */
import {
  CHECKLIST,
  ascii,
  checklistTitle,
  dueOn,
  listDescription,
  listName,
  openClientList,
  postInterviewToList,
  syncEnterpriseIntakesToBasecamp,
  transcriptHtml,
  writeupHtml,
} from '../enterpriseIntakeBasecamp';
/* eslint-enable import/first */

const FORM_DAY = new Date('2026-11-20T18:00:00Z'); // noon Central

function row(over: Record<string, unknown> = {}) {
  const r: any = {
    id: 'i-1',
    lead_id: 7,
    status: 'form',
    full_name: 'Dana Reyes',
    email: 'dana@acme.test',
    company: 'Acme Logistics',
    role: 'COO',
    phone: '(214) 555-0100',
    call_consent: true,
    website: 'acme.test',
    service: 'Build',
    department: 'Operations',
    process: 'Dispatchers re-key orders.\nAbout 300 a day.',
    people_count: 4,
    hours_per_week: '20.0',
    required_return: 'Hours back',
    start_timing: 'This quarter',
    other_deciders: 'CFO',
    bc_todolist_id: null,
    understanding_id: null,
    interviewed_via: null,
    transcript: null,
    bc_writeup_posted_at: null,
    bc_checklist_ready_at: null,
    bc_interview_ticked_at: null,
    createdAt: FORM_DAY,
    ...over,
  };
  r.update = jest.fn(async (patch: any) => Object.assign(r, patch));
  return r;
}

beforeEach(() => {
  jest.clearAllMocks();
  for (const k of Object.keys(mockEnv)) delete mockEnv[k];
  Object.assign(mockEnv, {
    enterpriseIntakeBcProjectId: '49670056',
    enterpriseIntakeBcOwnerId: '17454835',
    frontendUrl: 'https://enterprise.colaberry.ai',
  });
  let n = 100;
  mockBcGet.mockResolvedValue({ dock: [{ name: 'message_board', id: 1 }, { name: 'todoset', id: 555 }] });
  mockBcPost.mockImplementation(async () => ({ id: (n += 1), app_url: 'https://app.basecamp.com/x' }));
  mockBcGetAll.mockResolvedValue([]);
});

describe('the checklist', () => {
  it('follows the plan, start to signed, and says who does each step', () => {
    expect(CHECKLIST.map((s) => s.key)).toEqual(['form', 'interview', 'research', 'options', 'meeting', 'proposal', 'approve', 'follow', 'signed']);
    expect(checklistTitle(CHECKLIST[6])).toBe('Ali: Approve and send the proposal');
  });

  it('dates in Central time', () => {
    // 03:00 UTC on the 21st is still the evening of the 20th in Central.
    expect(dueOn(new Date('2026-11-21T03:00:00Z'), 0)).toBe('2026-11-20');
    expect(dueOn(FORM_DAY, 7)).toBe('2026-11-27');
  });
});

describe('Basecamp text', () => {
  it('is ASCII only, and escaped', () => {
    expect(ascii('José — “AI”')).toBe('Jose - "AI"');
    expect(listName(row({ company: 'Café <Co>' }))).toBe('Cafe <Co> - Dana Reyes');
    expect(listDescription(row({ company: '<b>x</b>' }))).not.toContain('<b>x</b>');
  });

  it('puts every form answer and the lead link in the description, with hours a year', () => {
    const d = listDescription(row());
    expect(d).toContain('https://enterprise.colaberry.ai/admin/leads/7');
    expect(d).toContain('20 (about 1,040 hours a year)');
    expect(d).toContain('This quarter');
    expect(d).toContain('Dispatchers re-key orders.<br>About 300 a day.');
    expect(/^[\x09\x0A\x0D\x20-\x7E]*$/.test(d)).toBe(true);
  });

  it('groups the write-up by what it is about, and keeps the transcript line by line', () => {
    const h = writeupHtml([
      { dimension: 'current_workflow', value: 'They re-key orders.' },
      { dimension: 'systems', value: 'McLeod TMS.' },
      { dimension: 'current_workflow', value: '300 a day.' },
    ]);
    expect(h).toContain('<strong>Current workflow</strong></div><ul><li>They re-key orders.</li><li>300 a day.</li></ul>');
    expect(transcriptHtml('AI: Hi\nThem: <hello>')).toBe('<div>AI: Hi</div><div>Them: &lt;hello&gt;</div>');
    expect(transcriptHtml(null)).toContain('No transcript');
  });
});


const ALL_TITLES = CHECKLIST.map((s) => checklistTitle(s));
const LIST_TODOS = '/buckets/49670056/todolists/101/todos.json';

describe('the form opens the client list', () => {
  it('creates one list, saves its id first, then the dated checklist, all owned by Ali', async () => {
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    expect(await openClientList('i-1')).toBe('opened');

    const [listUrl, listBody] = mockBcPost.mock.calls[0];
    expect(listUrl).toBe('/buckets/49670056/todosets/555/todolists.json');
    expect(listBody.name).toBe('Acme Logistics - Dana Reyes');
    expect(intake.update).toHaveBeenCalledWith({ bc_todolist_id: '101' });
    // Saved before any to-do is created, so a half-done run can never open a second list.
    expect(intake.update.mock.invocationCallOrder[0]).toBeLessThan(mockBcPost.mock.invocationCallOrder[1]);

    const todos = mockBcPost.mock.calls.filter(([u]) => u === LIST_TODOS).map(([, b]) => b);
    expect(todos.map((t) => t.content)).toEqual(ALL_TITLES);
    for (const t of todos) {
      expect(t.assignee_ids).toEqual([17454835]);
      expect(t.due_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.notify).toBe(false);
    }
    expect(todos[0]).toMatchObject({ content: 'AI: Form answers and lead link on this list', due_on: '2026-11-20' });
    const done = mockBcPost.mock.calls.filter(([u]) => /completion\.json$/.test(u));
    expect(done).toEqual([['/buckets/49670056/todos/102/completion.json', {}]]);
    expect(intake.update).toHaveBeenLastCalledWith({ bc_checklist_ready_at: expect.any(Date) });
  });

  it('repairs a half-built checklist: adds only the missing steps, never a second list', async () => {
    const intake = row({ bc_todolist_id: '101' });
    mockFindByPk.mockResolvedValue(intake);
    mockBcGetAll.mockImplementation(async (url: string) =>
      url.endsWith('?completed=true')
        ? [{ id: 1, content: ALL_TITLES[0] }]
        : [{ id: 2, content: ALL_TITLES[1] }, { id: 3, content: ALL_TITLES[2] }],
    );
    expect(await openClientList('i-1')).toBe('repaired');
    expect(mockBcPost.mock.calls.some(([u]) => u.endsWith('todolists.json'))).toBe(false);
    const made = mockBcPost.mock.calls.filter(([u]) => u === LIST_TODOS).map(([, b]) => b.content);
    expect(made).toEqual(ALL_TITLES.slice(3));
    // The form step was already ticked; it is not ticked again.
    expect(mockBcPost.mock.calls.some(([u]) => /completion\.json$/.test(u))).toBe(false);
    expect(intake.update).toHaveBeenCalledWith({ bc_checklist_ready_at: expect.any(Date) });
  });

  it('adopts a list an earlier timed-out create already made, instead of opening a second', async () => {
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    mockBcGetAll.mockImplementation(async (url: string) =>
      url.endsWith('/todosets/555/todolists.json')
        ? [
            // Same name, a different person's email: not this client's list.
            { id: 700, name: 'Acme Logistics - Dana Reyes', description: 'Email: someone-else@acme.test' },
            { id: 701, name: '[Form] Acme Logistics - Dana Reyes', description: '<li><strong>Email:</strong> dana@acme.test</li>' },
          ]
        : [],
    );
    expect(await openClientList('i-1')).toBe('repaired');
    expect(intake.update).toHaveBeenCalledWith({ bc_todolist_id: '701' });
    expect(mockBcPost.mock.calls.some(([u]) => u.endsWith('/todolists.json') && u.includes('todosets'))).toBe(false);
  });

  it('leaves a complete list alone', async () => {
    mockFindByPk.mockResolvedValue(row({ bc_todolist_id: '999', bc_checklist_ready_at: new Date() }));
    expect(await openClientList('i-1')).toBe('exists');
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('two overlapping opens for one client create one list', async () => {
    const intake = row();
    mockFindByPk.mockResolvedValue(intake);
    const [a, b] = await Promise.all([openClientList('i-1'), openClientList('i-1')]);
    expect([a, b].sort()).toEqual(['busy', 'opened']);
    expect(mockBcPost.mock.calls.filter(([u]) => u.endsWith('todolists.json'))).toHaveLength(1);
  });

  it('does nothing until the project is configured', async () => {
    mockEnv.enterpriseIntakeBcProjectId = '';
    expect(await openClientList('i-1')).toBe('off');
    expect(mockFindByPk).not.toHaveBeenCalled();
  });
});

describe('the interview lands on the list', () => {
  const interviewed = (over: Record<string, unknown> = {}) =>
    row({
      status: 'interviewed',
      bc_todolist_id: '101',
      bc_checklist_ready_at: new Date(),
      understanding_id: 'u-1',
      interviewed_via: 'chat',
      transcript: 'AI: Hi\nThem: Hello',
      ...over,
    });

  beforeEach(() => {
    mockRecordFind.mockResolvedValue({ items: [{ dimension: 'systems', value: 'McLeod TMS.' }] });
    mockBcGetAll.mockImplementation(async (url: string) =>
      url.endsWith('?completed=true') ? [] : [{ id: 302, content: ALL_TITLES[1] }],
    );
    mockStaticUpdate.mockResolvedValue([1]);
  });

  it('claims the post, posts the write-up and transcript, then ticks the interview to-do', async () => {
    const intake = interviewed();
    mockFindByPk.mockResolvedValue(intake);
    expect(await postInterviewToList('i-1')).toBe('posted');
    expect(mockStaticUpdate).toHaveBeenCalledWith(
      { bc_writeup_posted_at: expect.any(Date) },
      { where: { id: 'i-1', bc_writeup_posted_at: null } },
    );
    const [url, body] = mockBcPost.mock.calls[0];
    expect(url).toBe('/buckets/49670056/recordings/101/comments.json');
    expect(body.content).toContain('AI interview done (typed).');
    expect(body.content).toContain('<li>McLeod TMS.</li>');
    expect(body.content).toContain('<div>Them: Hello</div>');
    expect(mockBcPost).toHaveBeenLastCalledWith('/buckets/49670056/todos/302/completion.json', {});
    expect(intake.update).toHaveBeenCalledWith({ bc_interview_ticked_at: expect.any(Date) });
  });

  it('posts at most once when two callers arrive together (in process)', async () => {
    mockFindByPk.mockImplementation(async () => interviewed());
    const results = await Promise.all([postInterviewToList('i-1'), postInterviewToList('i-1')]);
    expect(results.sort()).toEqual(['busy', 'posted']);
    expect(mockBcPost.mock.calls.filter(([u]) => u.endsWith('comments.json'))).toHaveLength(1);
  });

  it('posts nothing when another process already holds the claim, but still ticks', async () => {
    mockFindByPk.mockResolvedValue(interviewed());
    mockStaticUpdate.mockResolvedValue([0]);
    expect(await postInterviewToList('i-1')).toBe('ticked');
    expect(mockBcPost.mock.calls.some(([u]) => u.endsWith('comments.json'))).toBe(false);
  });

  it('releases the claim when Basecamp refuses the comment, so the sweep can try again', async () => {
    mockFindByPk.mockResolvedValue(interviewed());
    mockBcPost.mockRejectedValueOnce(new Error('BC POST -> 503'));
    await expect(postInterviewToList('i-1')).rejects.toThrow('503');
    expect(mockStaticUpdate).toHaveBeenLastCalledWith({ bc_writeup_posted_at: null }, { where: { id: 'i-1' } });
  });

  it('keeps the tick open for the sweep when the interview to-do is not on the list yet', async () => {
    const intake = interviewed({ bc_writeup_posted_at: new Date() });
    mockFindByPk.mockResolvedValue(intake);
    mockBcGetAll.mockResolvedValue([]);
    expect(await postInterviewToList('i-1')).toBe('not_ready');
    expect(intake.update).not.toHaveBeenCalled();
  });

  it('does nothing once posted and ticked', async () => {
    mockFindByPk.mockResolvedValue(interviewed({ bc_writeup_posted_at: new Date(), bc_interview_ticked_at: new Date() }));
    expect(await postInterviewToList('i-1')).toBe('done');
    expect(mockBcPost).not.toHaveBeenCalled();
  });

  it('waits for a complete list', async () => {
    mockFindByPk.mockResolvedValue(interviewed({ bc_checklist_ready_at: null }));
    expect(await postInterviewToList('i-1')).toBe('not_ready');
    expect(mockBcPost).not.toHaveBeenCalled();
  });
});

describe('the sweep', () => {
  it('finishes lists and posts waiting interviews, and one failure does not stop the rest', async () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b' });
    const c = row({ id: 'c', status: 'interviewed', bc_todolist_id: '101', bc_checklist_ready_at: new Date(), understanding_id: 'u-1' });
    mockFindAll.mockResolvedValueOnce([a, b]).mockResolvedValueOnce([c]);
    mockFindByPk.mockImplementation(async (id: string) => ({ a, b, c } as any)[id]);
    mockRecordFind.mockResolvedValue({ items: [] });
    mockStaticUpdate.mockResolvedValue([1]);
    mockBcGetAll.mockImplementation(async (url: string) => (url.endsWith('?completed=true') ? [] : [{ id: 302, content: ALL_TITLES[1] }]));
    let first = true;
    mockBcPost.mockImplementation(async (url: string) => {
      if (url.endsWith('todolists.json') && first) {
        first = false;
        throw new Error('BC POST -> 503');
      }
      return { id: 500 };
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
    expect(await syncEnterpriseIntakesToBasecamp()).toEqual({ opened: 1, posted: 1, failed: 1 });
  });

  it('is a no-op without the project', async () => {
    mockEnv.enterpriseIntakeBcProjectId = '';
    expect(await syncEnterpriseIntakesToBasecamp()).toEqual({ opened: 0, posted: 0, failed: 0 });
    expect(mockFindAll).not.toHaveBeenCalled();
  });
});
