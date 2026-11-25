import { VERSION_ATTR_KEYS, PROFILE_ATTR_KEYS } from '../profileTypes';
import { VOICE_TABLE_SPECS } from '../../../../db/voiceStudioTableSpecs';
import { disclosesAi,
  VersionContentSchema, canonicalJson, contentHash, isSameContent, renderCall, transition, SAFETY_SUFFIX, type VersionContent,
} from '../versionContent';

const base = (): VersionContent => ({
  prompt: 'You are Cory from Colaberry. {prompt}',
  first_message: null,
  disclosure: "This is Colaberry's AI assistant. I'm an AI, not a person.",
  kb_refs: ['admissions_knowledge'],
  tool_permissions: ['next_open_strategy_slots', 'admissions_knowledge'],
  engine: 'conversation_relay',
  engine_config: { promptShell: true },
  voice_id: 'voice-1',
  language: 'en-US',
  safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 6 },
  max_call_seconds: 180,
});

describe('typed attributes match the table spec (VS1.4 carry)', () => {
  const cols = (t: string) => VOICE_TABLE_SPECS.find((s) => s.table === t)!.columns.map((c) => c.name).sort();
  it('voice_agent_versions', () => expect([...VERSION_ATTR_KEYS].sort()).toEqual(cols('voice_agent_versions')));
  it('voice_agent_profiles', () => expect([...PROFILE_ATTR_KEYS].sort()).toEqual(cols('voice_agent_profiles')));
});

describe('content hash', () => {
  it('is stable across key order and permission order', () => {
    const a = base();
    const b = { ...base(), tool_permissions: ['admissions_knowledge', 'next_open_strategy_slots', 'admissions_knowledge'] };
    const reordered = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(a).reverse()))) as VersionContent;
    expect(contentHash(a)).toBe(contentHash(b));
    expect(contentHash(a)).toBe(contentHash(reordered));
    expect(contentHash(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each<[string, (c: VersionContent) => VersionContent]>([
    ['prompt', (c) => ({ ...c, prompt: `${c.prompt} ` })],
    ['first_message', (c) => ({ ...c, first_message: 'Hi' })],
    ['disclosure', (c) => ({ ...c, disclosure: `${c.disclosure}!` })],
    ['tool removed', (c) => ({ ...c, tool_permissions: ['admissions_knowledge'] })],
    ['engine', (c) => ({ ...c, engine: 'openai_realtime' })],
    ['engine_config', (c) => ({ ...c, engine_config: { promptShell: false } })],
    ['voice_id', (c) => ({ ...c, voice_id: 'voice-2' })],
    ['language', (c) => ({ ...c, language: 'es-US' })],
    ['safety', (c) => ({ ...c, safety_policy: { bookingRequiresHumanApproval: true, maxToolCallsPerCall: 5 } })],
    ['max_call_seconds', (c) => ({ ...c, max_call_seconds: 181 })],
    ['kb_refs', (c) => ({ ...c, kb_refs: [] })],
  ])('changes when %s changes', (_n, edit) => {
    expect(contentHash(edit(base()))).not.toBe(contentHash(base()));
    expect(isSameContent(edit(base()), base())).toBe(false);
  });

  it('canonicalJson sorts nested keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, 1] } })).toBe('{"a":{"c":[2,1]},"b":1}');
  });
});

describe('schema', () => {
  it('accepts the base content', () => expect(VersionContentSchema.safeParse(base()).success).toBe(true));
  it.each<[string, Record<string, unknown>]>([
    ['disclosure without AI', { disclosure: 'This is Colaberry calling about your class.' }],
    ['AI only in a product name', { disclosure: 'Hi, I am calling about our AI Accelerator.' }],
    ['a product name after "this is"', { disclosure: 'Hi, this is Colaberry, home of the AI Accelerator.' }],
    ['a denial', { disclosure: 'You are not talking to an AI, I promise.' }],
    ['a denial in the first person', { disclosure: "Hello there, I'm not an AI." }],
    ['a contradiction', { disclosure: "This is Colaberry's AI assistant. I am not an AI." }],
    ['unknown key', { extra: 1 }],
    ['unknown kb source', { kb_refs: ['web'] }],
    ['bad tool name', { tool_permissions: ['Drop Table'] }],
    ['booking allowed', { safety_policy: { bookingRequiresHumanApproval: false, maxToolCallsPerCall: 1 } }],
    ['call too long', { max_call_seconds: 3601 }],
    ['empty prompt', { prompt: '' }],
    ['unknown engine_config key', { engine_config: { tools: ['x'] } }],
  ])('rejects %s', (_n, patch) => expect(VersionContentSchema.safeParse({ ...base(), ...patch }).success).toBe(false));
});

describe('lifecycle', () => {
  it('draft -> approved (other person) -> published -> retired', () => {
    expect(transition('draft', 'approve', 'ali@x', 'seed:synthflow')).toEqual({ ok: true, next: 'approved' });
    expect(transition('approved', 'publish', 'ali@x', 'seed:synthflow')).toEqual({ ok: true, next: 'published' });
    expect(transition('published', 'retire', 'ali@x', 'seed:synthflow')).toEqual({ ok: true, next: 'retired' });
  });
  it('refuses self-approval, publishing a draft, re-approval, and reviving a retired version', () => {
    expect(transition('draft', 'approve', 'Ali@X ', 'ali@x')).toEqual({ ok: false, reason: 'four_eyes_required' });
    expect(transition('draft', 'publish', 'ali@x', 'b')).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(transition('published', 'approve', 'ali@x', 'b')).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(transition('retired', 'publish', 'ali@x', 'b')).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(transition('retired', 'retire', 'ali@x', 'b')).toEqual({ ok: false, reason: 'invalid_transition' });
    expect(transition('draft', 'approve', '  ', 'b')).toEqual({ ok: false, reason: 'actor_required' });
  });
});

describe('renderCall (prompt-only shell semantics)', () => {
  it('a shell call without a per-call prompt is refused, like synthflowService no_prompt', () => {
    expect(renderCall(base(), {})).toEqual({ ok: false, reason: 'no_prompt' });
    expect(renderCall(base(), { prompt: '   ' })).toEqual({ ok: false, reason: 'no_prompt' });
  });
  it('substitutes {prompt} and known variables once, never recursively', () => {
    const c = { ...base(), prompt: '{prompt} Company: {company}. Unknown stays {other}.' };
    const r = renderCall(c, { prompt: 'Call about {company}', variables: { company: 'Acme {prompt}' } });
    expect(r.ok && r.system.startsWith('Call about company Company: Acme prompt. Unknown stays {other}.')).toBe(true);
  });
  it.each(["Hi, this is Colaberry's AI assistant.", "I'm an AI calling from Colaberry.", 'I am an AI, not a person.', 'You are speaking with an AI assistant.', "You're talking to an AI.", 'This is an automated AI agent from Colaberry.', 'I am a virtual assistant from Colaberry.'])('accepts a real disclosure: %s', (d) => {
    expect(disclosesAi(d)).toBe(true);
  });

  it.each(['Hi, this is Colaberry calling about an AI class.', "I'm Sam from Colaberry calling about an AI program you asked about.", 'I am a real person who teaches an AI class.', 'This is Sam, your AI agent builder class advisor.',
    'This is a human, no AI assistant here.', 'I am an AI engineer at Colaberry.', 'This is an AI class reminder.', "I'm an AI assistant manager.", 'This is the AI Accelerator team.', "This is Colaberry's AI assistant. I'm a real person.", 'This is not an AI.', 'I work with an AI assistant.', 'You asked about an AI.',
    'This is about AI.', "I'm calling about AI.", "I'm into AI.", 'You are speaking with people behind AI.', 'This is an AI for beginners class.', "I'm an AI and data engineer.", "I am human. I'm an AI assistant.", 'This is Sam, an AI engineer.', 'This is the AI team from Colaberry.'])('refuses: %s', (d) => {
    expect(disclosesAi(d)).toBe(false);
  });

  it.each(["I'm not a person, I'm an AI assistant.", "I'm AI.", 'Hello, I am an AI voice agent calling on behalf of Colaberry.', 'You are speaking with the Colaberry AI assistant.', 'Hi, I am Cory, an AI assistant from Colaberry.'])('also accepts: %s', (d) => {
    expect(disclosesAi(d)).toBe(true);
  });

  it('no first message replaces the approved disclosure; only its exact words do', () => {
    for (const first_message of ["Hi, I'm an AI assistant from Colaberry.", 'Hi, this is Colaberry calling about an AI class.']) {
      const g = renderCall({ ...base(), first_message }, { prompt: 'x' });
      expect(g.ok && g.greeting).toBe(`${base().disclosure} ${first_message}`);
    }
    const g = renderCall({ ...base(), first_message: `Hi! ${base().disclosure}` }, { prompt: 'x' });
    expect(g.ok && g.greeting).toBe(`Hi! ${base().disclosure}`);
  });

  it('a first message that only names an AI product still gets the disclosure', () => {
    const g = renderCall({ ...base(), first_message: 'Hi, I am calling about our AI Accelerator.' }, { prompt: 'Follow up.' });
    expect(g.ok && g.greeting.startsWith(base().disclosure)).toBe(true);
  });

  it('always appends the safety suffix and leads with the AI disclosure', () => {
    const r = renderCall(base(), { prompt: 'Follow up on the class.' });
    expect(r.ok && r.system.endsWith(SAFETY_SUFFIX)).toBe(true);
    expect(r.ok && r.greeting).toBe(base().disclosure);
    const g = renderCall({ ...base(), first_message: 'Hi there!' }, { prompt: 'x' });
    expect(g.ok && g.greeting).toBe(`${base().disclosure} Hi there!`);
    const own = renderCall({ ...base(), first_message: "Hi, I'm Colaberry's AI assistant." }, { prompt: 'x' });
    expect(own.ok && own.greeting).toBe(`${base().disclosure} Hi, I'm Colaberry's AI assistant.`); // VS4.2: never trusted to replace it
  });
  it('a non-shell version renders without a per-call prompt', () => {
    const r = renderCall({ ...base(), prompt: 'Fixed script.', engine_config: { promptShell: false } }, {});
    expect(r.ok).toBe(true);
  });
});
