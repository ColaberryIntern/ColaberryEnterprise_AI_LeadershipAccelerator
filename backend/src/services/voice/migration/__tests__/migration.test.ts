import fs from 'fs';
import { assistantKey, fetchAssistants, toRow, type RawAssistant } from '../assistantInventory';
import { checkMatrix, COLUMNS, compareLive, HEADING, parseMatrix, type MatrixRow } from '../matrix';
import { DEFAULT_MATRIX, lineFor, parseReportArgs } from '../../../../scripts/voice/migrationReport';

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
  expect(parseReportArgs(['--live', '--inventory', 'x.json'])).toMatchObject({ ok: true, live: true, inventory: 'x.json' });
  for (const bad of [['--apply'], ['--matrix'], ['--inventory', 'x'], ['--matrix', '--live']]) expect(parseReportArgs(bad).ok).toBe(false);
});
