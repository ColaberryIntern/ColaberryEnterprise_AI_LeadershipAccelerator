import fs from 'fs';
import { assistantKey, fetchAssistants, toRow, type RawAssistant } from '../assistantInventory';
import { checkMatrix, COLUMNS, compareLive, HEADING, parseMatrix, type MatrixRow } from '../matrix';
import os from 'os';
import path from 'path';
import { captureAll, COVERAGE, redactDeep, redactText } from '../privateCapture';
import { DEFAULT_MATRIX, insideRepo, lineFor, parseReportArgs, run } from '../../../../scripts/voice/migrationReport';

const row = (over: Partial<MatrixRow> = {}): MatrixRow => ({ ...Object.fromEntries(COLUMNS.map((c) => [c, 'x'])), Key: 'sf-0123abcd', Stage: 'decision', Status: 'APPROVAL_REQUIRED', Evidence: '-', ...over } as MatrixRow);
const doc = (rows: MatrixRow[], head: readonly string[] = COLUMNS) => `# t\n\n${HEADING}\n\ntext\n\n| ${head.join(' | ')} |\n|${head.map(() => '---').join('|')}|\n${rows.map((r) => `| ${COLUMNS.map((c) => r[c]).join(' | ')} |`).join('\n')}\n\n## Next\n| not | a row |\n`;

describe('matrix', () => {
  it('reads only its own section, with Windows line endings too', () => {
    const m = parseMatrix(doc([row(), row({ Key: 'sf-11111111' })]).replace(/\n/g, '\r\n'));
    expect(m.ok && m.rows.map((r) => r.Key)).toEqual(['sf-0123abcd', 'sf-11111111']);
  });
  it.each([['no section', '# x'], ['no table', `${HEADING}\n\ntext`], ['other columns', doc([row()], ['A', 'B'])], ['a short row', doc([row()]).replace('| x | x |', '| x |')]])('refuses %s', (_n, md) => { expect(parseMatrix(md).ok).toBe(false); });
  it('a clean table has no problems', () => expect(checkMatrix([row()])).toEqual([]));
  it.each<[string, Partial<MatrixRow>, RegExp]>([
    ['no owner', { Owner: '' }, /no owner/], ['an owner of TBD', { Owner: 'TBD' }, /no owner/], ['no rollback', { Rollback: '-' }, /no rollback/], ['a made-up status', { Status: 'DONE' }, /status/], ['a made-up stage', { Stage: 'soon' }, /stage/],
    ['PASS with no evidence', { Status: 'PASS' }, /PASS without evidence/], ['live with no evidence', { Stage: 'live' }, /live without evidence/], ['a phone number', { Risk: 'call (214) 555-0100' }, /phone-like/], ['a raw id', { Key: '1715' }, /key/],
  ])('flags %s', (_n, over, re) => expect(checkMatrix([row(over)]).map((p) => p.problem).join()).toMatch(re));
  it('flags a duplicate and an empty table', () => {
    expect(checkMatrix([row(), row()])).toEqual([{ key: 'sf-0123abcd', problem: 'duplicate key' }]);
    expect(checkMatrix([])).toHaveLength(1);
  });
  it('the vendor and the table must agree, both ways; a retired assistant may be gone; an empty vendor list never passes', () => {
    const live = [{ key: 'sf-0123abcd', name: 'x' }];
    expect(compareLive([row()], live).ok).toBe(true);
    expect(compareLive([row()], [...live, { key: 'sf-99999999', name: 'new' }])).toMatchObject({ ok: false, missing: ['sf-99999999'] });
    expect(compareLive([row(), row({ Key: 'sf-22222222' })], live)).toMatchObject({ ok: false, gone: ['sf-22222222'] });
    expect(compareLive([row(), row({ Key: 'sf-22222222', Stage: 'retired' })], live).ok).toBe(true);
    expect(compareLive([row()], [{ key: 'sf-0123abcd', name: 'renamed' }])).toMatchObject({ ok: false, renamed: ['sf-0123abcd'] });
    expect(compareLive([], []).ok).toBe(false);
  });
  it('the committed matrix is clean', () => {
    const m = parseMatrix(fs.readFileSync(DEFAULT_MATRIX, 'utf8'));
    if (!m.ok) throw new Error(m.reason);
    expect(checkMatrix(m.rows)).toEqual([]);
    expect(m.rows).toHaveLength(14);
  });
  it('a report line says the stage, owner and evidence', () => expect(lineFor(row({ Owner: 'Ali', Evidence: '' }), 2)).toMatch(/owner Ali \| stage decision \| APPROVAL_REQUIRED \| evidence none \| 2 problem/));
});

describe('inventory', () => {
  const raw: RawAssistant = { model_id: 'secret-model-id', name: 'Cora 214-555-0100 | x', type: 'outbound', phone_number: '+12145550100', attached_phone_numbers: ['+12145550100'], external_webhook_url: 'https://hooks.example.com/private/path?token=abc', is_recording: true, knowledge_base_id: 'kb-secret',
    actions: [{ id: 1 }], created_at: '2026-01-02T00:00:00Z', max_duration: { duration_seconds: 300, is_enabled: true }, agent: { prompt: 'Hello {prompt} and {firstName}. Private words.', greeting_message: 'Hi, I am an AI.', language: 'en-US', provider: 'elevenlabs', voice_id: 'voice-secret' } };
  it('says what it is and carries nothing private', () => {
    const r = toRow(raw, { SYNTHFLOW_WELCOME_AGENT_ID: 'secret-model-id', SYNTHFLOW_API_KEY: 'secret-model-id', SYNTHFLOW_INTEREST_AGENT_ID: 'other' });
    expect(r).toMatchObject({ key: assistantKey('secret-model-id'), envNames: ['SYNTHFLOW_WELCOME_AGENT_ID'], numbers: 1, promptShell: true, variables: ['{firstName}', '{prompt}'], greetingNamesAi: true, webhookHost: 'hooks.example.com', webhookHasToken: true, knowledgeBase: true, actions: 1, recording: true, recordingConsent: false, maxSeconds: 300, createdOn: '2026-01-02', voiceSet: true });
    expect(JSON.stringify(r)).not.toMatch(/secret|5550100|555-0100|Private words|private\/path|abc"/);
    expect(r.name).not.toContain('|');
  });
  it('handles a bare assistant, and refuses one with no id', () => {
    expect(toRow({ model_id: 'm' })).toMatchObject({ name: '(unnamed)', direction: 'unknown', numbers: 0, maxSeconds: null, webhookHost: null });
    expect(toRow({ model_id: 'm', external_webhook_url: 'not a url' }).webhookHost).toBe('unparseable');
    expect(() => toRow({})).toThrow('without an id');
  });

  const page = (list: RawAssistant[], total: number, status = 200) => ({ ok: status === 200, status, json: async () => ({ response: { assistants: list, pagination: { total_records: total } } }) }) as Response;
  const many = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ model_id: `m${from + i}` }));
  it('reads every page, with GET only and a timeout', async () => {
    const f = jest.fn().mockResolvedValueOnce(page(many(50), 60)).mockResolvedValueOnce(page(many(10, 50), 60));
    expect(await fetchAssistants('k', f as never)).toHaveLength(60);
    expect(f.mock.calls.map((c) => String(c[0]).split('?')[1])).toEqual(['limit=50&offset=0', 'limit=50&offset=50']);
    for (const c of f.mock.calls) expect(c[1]).toMatchObject({ method: 'GET', signal: expect.anything() });
  });
  it.each([['fewer than it says', [page(many(3), 5), page([], 5)]], ['more than it says', [page(many(6), 5)]], ['the same one twice', [page([{ model_id: 'a' }, { model_id: 'a' }], 2)]], ['another shape', [{ ok: true, status: 200, json: async () => ({}) } as Response]]])('a list with %s is not an inventory', async (_n, pages) => {
    const f = jest.fn();
    for (const p of pages) f.mockResolvedValueOnce(p);
    await expect(fetchAssistants('k', f as never)).rejects.toMatchObject({ name: 'ContractViolation' });
  });
  it.each([[401, 'AuthError'], [403, 'AuthError'], [503, 'UpstreamUnavailable']])('status %i is %s, and the key is not in the error', async (status, name) => {
    await expect(fetchAssistants('very-secret', jest.fn().mockResolvedValue(page([], 0, status)) as never)).rejects.toMatchObject({ name, message: expect.not.stringContaining('very-secret') });
  });
});

it('the command refuses what it does not know', () => {
  expect(parseReportArgs([])).toMatchObject({ ok: true, live: false });
  const out = path.join(os.tmpdir(), 'x.json');
  expect(parseReportArgs(['--live', '--inventory', out, '--capture', out])).toMatchObject({ ok: true, live: true, inventory: out, capture: out });
  for (const bad of [['--apply'], ['--matrix'], ['--inventory', out], ['--capture', out], ['--matrix', '--live'], ['--live', '--capture', path.join(__dirname, 'x.json')], ['--live', '--inventory', 'x.json']]) expect(parseReportArgs(bad).ok).toBe(false);
});

describe('private capture', () => {
  it.each([
    ['a URL keeps only its host', 'see https://hooks.example.com/a/b?token=zzz now', 'see https://hooks.example.com/<redacted> now'],
    ['an email', 'write to pat@example.com', 'write to <email>'],
    ['phone numbers', 'call (214) 555-0100 or +1 214-555-0100 or 2145550100', 'call <phone> or <phone> or <phone>'],
    ['a key', 'use sk-abcdefghijklmnop123', 'use <redacted key>'],
    ['ordinary text, years and prices', 'In 2026 it costs 1,200 dollars for 12 weeks', 'In 2026 it costs 1,200 dollars for 12 weeks'],
  ])('%s', (_n, a, b) => expect(redactText(a)).toBe(b));
  it('redacts by key at any depth, in header lists and in JSON kept as text, and keeps the settings', () => {
    const r = JSON.stringify(redactDeep({ agent: { prompt: 'Hello', voice_id: 'v1' }, phone_number: '+12145550100', headers: { Authorization: 'x' }, http: { api_key: 'kkkk', params: [{ key: 'X-Auth-Token', value: 'tttt' }, { key: 'city', value: 'Plano' }] }, body: '{"password":"pppp","city":"Frisco"}', to_phone_number: 12145550100, api_response: { contact: { first: 'Zelda' } }, max_duration: { duration_seconds: 300 } }));
    expect(r).not.toMatch(/5550100|Zelda|"x"|kkkk|tttt|pppp/);
    for (const keep of ['Hello', 'v1', 'Plano', 'Frisco', '300']) expect(r).toContain(keep);
  });

  const reply = (response: unknown, status = 200) => ({ ok: status === 200, status, json: async () => ({ response }) }) as Response;
  const A = { model_id: 'm1', name: 'Agent', type: 'outbound', phone_number: '+12145550100', attached_phone_numbers: ['+12145550100'], knowledge_base_id: 'k1', input_variables: [{ name: 'cohort' }], external_webhook_url: 'https://h.example/p?token=secretvalue', agent: { prompt: 'Say {first_name}. Key sk-abcdefghijklmnop123', greeting_message: 'Hi {cohort_name}', voice_id: 'voice-9', allowed_idle_time_seconds: 12 } };
  const api = (over: Record<string, unknown> = {}) => jest.fn(async (u: string) => {
    const p = u.replace('https://api.synthflow.ai/v2', '');
    for (const [k, v] of Object.entries(over)) if (p.startsWith(k)) return v as Response;
    if (p.startsWith('/assistants')) return reply({ assistants: [A], pagination: { total_records: 1 } });
    if (p.startsWith('/actions')) return reply({ actions: [{ action_id: 'a1', action_type: 'INFORMATION_EXTRACTOR', name: 'n', parameters_hard_coded: { api_key: 'zzzz' } }], pagination: { total_records: 1 } });
    if (p.startsWith('/knowledge_base')) return reply({ knowledge_bases: [{ id: 'k1', name: 'Admissions' }], total_records: 1 });
    if (p.startsWith('/numbers')) return reply({ phone_numbers: [], pagination: { total_records: 0 } });
    if (p.startsWith('/calls')) return reply({ calls: [], pagination: { total_records: 1545 } });
    return reply(null, 404);
  });
  it('captures every field the migration needs, with GET only, and no credential or number', async () => {
    const f = api();
    const c = await captureAll('very-secret', f as never);
    expect(c.counts).toEqual({ assistants: 1, actions: 1, actionsDeclared: 1, actionTypes: { INFORMATION_EXTRACTOR: 1 }, knowledgeBases: 1, numbersListed: 0 });
    expect(c.assistants[0]).toMatchObject({ vendorId: 'm1', numberCount: 1, knowledgeBase: 'Admissions', variables: ['cohort', 'cohort_name', 'first_name'], callCount: 1545 });
    expect(c.assistants[0].config).toMatchObject({ agent: { greeting_message: 'Hi {cohort_name}', voice_id: 'voice-9', allowed_idle_time_seconds: 12 } });
    expect(JSON.stringify(c)).not.toMatch(/very-secret|secretvalue|5550100|zzzz|sk-abc/);
    for (const call of f.mock.calls as unknown as Array<[string, RequestInit]>) expect(call[1]).toMatchObject({ method: 'GET', signal: expect.any(AbortSignal) });
  });
  it.each<[string, Record<string, unknown>, string]>([
    ['more actions listed than declared', { '/actions': reply({ actions: [{ action_id: 'a' }, { action_id: 'b' }], pagination: { total_records: 1 } }) }, 'ContractViolation'],
    ['an action with no id', { '/actions': reply({ actions: [{}], pagination: { total_records: 1 } }) }, 'ContractViolation'],
    ['a knowledge base list that does not add up', { '/knowledge_base': reply({ knowledge_bases: [], total_records: 3 }) }, 'ContractViolation'],
    ['a call count that is missing', { '/calls': reply({ calls: [] }) }, 'ContractViolation'],
    ['a refusal', { '/actions': reply({}, 403) }, 'AuthError'], ['an outage', { '/knowledge_base': reply({}, 502) }, 'UpstreamUnavailable'],
  ])('%s is an error, never a partial capture', async (_n, over, name) => { await expect(captureAll('k', api(over) as never)).rejects.toMatchObject({ name }); });

  it('reads every page of actions', async () => {
    const f = api();
    const ids = Array.from({ length: 130 }, (_x, i) => ({ action_id: `a${i}`, action_type: 'X' }));
    const two = (async (u: string) => (u.includes('/actions') ? reply({ actions: ids.slice(Number(new URL(u).searchParams.get('offset')), Number(new URL(u).searchParams.get('offset')) + 100), pagination: { total_records: 130 } }) : f(u))) as never;
    expect((await captureAll('k', two)).counts).toMatchObject({ actions: 130, actionsDeclared: 130 });
  });

  it('every item is captured or is a real checklist step, and every step is used', () => {
    const md = fs.readFileSync(DEFAULT_MATRIX, 'utf8').replace(/\r\n/g, '\n');
    const steps = new Set([...md.slice(md.indexOf('## Manual export checklist')).matchAll(/^(\d+)\. /gm)].map((m) => m[1]));
    const used = new Set(COVERAGE.filter((c) => c.from === 'checklist').map((c) => c.where));
    expect([...used].sort()).toEqual([...steps].sort());
    for (const word of ['ids', 'direction', 'numbers', 'prompts', 'first messages', 'voices', 'knowledge base', 'variables', 'actions', 'webhooks', 'extraction', 'integrations', 'timeouts', 'concurrency', 'history', 'contract']) expect(COVERAGE.some((c) => c.item.includes(word))).toBe(true);
  });

  describe('the command', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
    const file = (n: string, s: string) => { const p = path.join(dir, n); fs.writeFileSync(p, s); return p; };
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => undefined); jest.spyOn(console, 'error').mockImplementation(() => undefined); });
    afterEach(() => jest.restoreAllMocks());
    afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));
    const key = assistantKey('m1');
    it('exits 0 on a clean matrix, 1 when a row lacks an owner, 2 when it cannot read', async () => {
      expect(await run(['--matrix', file('ok.md', doc([row()]))])).toBe(0);
      expect(await run(['--matrix', file('bad.md', doc([row({ Owner: '' })]))])).toBe(1);
      expect(await run(['--matrix', file('none.md', '# x')])).toBe(2);
      expect(await run(['--matrix', path.join(dir, 'absent.md')])).toBe(2);
      expect(await run(['--nope'])).toBe(2);
    });
    it('--live exits 1 when the vendor and the matrix differ, 2 with no key, and writes its files privately', async () => {
      const good = file('live.md', doc([row({ Key: key, Assistant: 'Agent' })]));
      const cap = path.join(dir, 'cap.json');
      expect(await run(['--live', '--matrix', good, '--capture', cap], { SYNTHFLOW_API_KEY: 'k' }, api() as never)).toBe(0);
      expect(JSON.parse(fs.readFileSync(cap, 'utf8')).counts.assistants).toBe(1);
      expect((console.log as jest.Mock).mock.calls.flat().join(' ')).not.toContain('Say {first_name}');
      expect(await run(['--live', '--matrix', file('live2.md', doc([row()]))], { SYNTHFLOW_API_KEY: 'k' }, api() as never)).toBe(1);
      expect(await run(['--live', '--matrix', good], {}, api() as never)).toBe(2);
      // declared 2, listed 1, and past the end the same page again (as the vendor does): kept, reported, not a clean exit
      const short = api();
      const gap = (async (u: string) => (u.includes('/actions') ? reply({ actions: [{ action_id: 'x', action_type: 'X' }], pagination: { total_records: 2 } }) : short(u))) as never;
      expect(await run(['--live', '--matrix', good, '--capture', cap], { SYNTHFLOW_API_KEY: 'k' }, gap)).toBe(1);
      expect((console.log as jest.Mock).mock.calls.flat().join(' ')).toContain('CAPTURE GAP: the vendor declares 2 actions and lists 1');
      expect(JSON.parse(fs.readFileSync(cap, 'utf8')).counts).toMatchObject({ actions: 1, actionsDeclared: 2 });
      const empty = (async (u: string) => (u.includes('/actions') && !u.endsWith('offset=0') ? reply({ actions: [] }) : (gap as (u: string) => unknown)(u))) as never;
      expect(await run(['--live', '--matrix', good, '--capture', cap], { SYNTHFLOW_API_KEY: 'k' }, empty)).toBe(1);
    });
    it('knows what is inside the repository', () => {
      expect(insideRepo(path.join(__dirname, 'x.json'))).toBe(true);
      expect(insideRepo(path.join(dir, 'x.json'))).toBe(false);
      expect(insideRepo('/tmp/x', dir)).toBe(false);
    });
  });
});
