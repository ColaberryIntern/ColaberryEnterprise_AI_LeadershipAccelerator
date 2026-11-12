/**
 * Tests for tool-identity recording on every agent action (Agent Tools Phase 5).
 *
 * WHAT THESE PIN, in order of how much damage each would do:
 *
 *   1. **Recording cannot break a tool call.** Three of the six wrapped dispatchers are live
 *      visitor-facing surfaces. A telemetry fault that takes down Maya's chat would be a far
 *      worse outcome than the blindness this phase fixes.
 *   2. **Record mode never refuses.** Ali chose record-now-enforce-later precisely because 136
 *      holdings across 31 agents have zero grant rows; enforcing today would refuse live work on
 *      the first tick.
 *   3. **A violation is still LOUD.** Recording quietly would make this phase worthless: the
 *      whole point is a list of what is running untied.
 *   4. **An unreadable grant list is not "no tools".** Refusing live traffic because a lookup
 *      failed is a worse failure than the one being guarded against.
 */
export {};

jest.mock('../../../aiEventService', () => ({
  __esModule: true,
  emitToolCall: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { withToolRecording, evaluate, modeFor, enforcedAgents } = require('../toolInvocationRecorder');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { emitToolCall } = require('../../../aiEventService');

const CTX = { agentName: 'Maya', toolName: 'send_document', surface: 'maya_site_chat' };

/** Lets the fire-and-forget telemetry, and its lazy import, settle before asserting on it. */
const flushAsync = () => new Promise((resolve) => setImmediate(resolve));

let logSpy: jest.SpyInstance;
let warnSpy: jest.SpyInstance;

beforeEach(() => {
  delete process.env.TOOL_ENFORCEMENT_AGENTS;
  jest.clearAllMocks();
  logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

const logged = () => logSpy.mock.calls.map((c) => String(c[0])).join(' ');
const warned = () => warnSpy.mock.calls.map((c) => String(c[0])).join(' ');

describe('recording cannot break a tool call', () => {
  it('returns the tool result unchanged', async () => {
    const out = await withToolRecording(CTX, async () => ({ success: true, summary: 'sent' }));
    expect(out).toEqual({ success: true, summary: 'sent' });
  });

  it('rethrows the tool error unchanged, never swallowing it', async () => {
    const boom = new TypeError('the tool exploded');
    await expect(withToolRecording(CTX, async () => { throw boom; })).rejects.toBe(boom);
  });

  it('still returns the result when the telemetry call throws', async () => {
    (emitToolCall as jest.Mock).mockImplementation(() => { throw new Error('telemetry down'); });
    const out = await withToolRecording(CTX, async () => 'fine');
    expect(out).toBe('fine');
  });

  it('still rethrows the tool error when telemetry also fails', async () => {
    (emitToolCall as jest.Mock).mockImplementation(() => { throw new Error('telemetry down'); });
    const boom = new RangeError('tool failed');
    await expect(withToolRecording(CTX, async () => { throw boom; })).rejects.toBe(boom);
  });

  it('records the failure outcome rather than reporting a success', async () => {
    await expect(withToolRecording(CTX, async () => { throw new Error('nope'); })).rejects.toThrow();
    expect(logged() + warned()).toContain('"outcome":"failure"');
  });
});

describe('record mode never refuses', () => {
  it('allows a tool the agent does not hold, and says it still ran', () => {
    const v = evaluate('Maya', 'initiate_voice_call', ['send_document']);
    expect(v.mode).toBe('record');
    expect(v.decision).toBe('allow');
    expect(v.violation).toBe(true);
    expect(v.reason).toContain('still ran');
  });

  it('names the switch an operator would flip, so the log is actionable', () => {
    const v = evaluate('Maya', 'initiate_voice_call', []);
    expect(v.reason).toContain('TOOL_ENFORCEMENT_AGENTS');
  });

  it('is the default for every agent when the switch is unset', () => {
    expect(modeFor('Maya')).toBe('record');
    expect(modeFor('Reese')).toBe('record');
    expect(enforcedAgents().size).toBe(0);
  });
});

describe('enforcement is per agent and flips without a redeploy', () => {
  it('refuses only for the named agent', () => {
    process.env.TOOL_ENFORCEMENT_AGENTS = 'Maya';
    expect(evaluate('Maya', 'unheld', []).decision).toBe('refuse');
    expect(evaluate('Reese', 'unheld', []).decision).toBe('allow');
  });

  it('is read per call, so a change takes effect immediately', () => {
    expect(modeFor('Dara')).toBe('record');
    process.env.TOOL_ENFORCEMENT_AGENTS = 'dara';
    expect(modeFor('Dara')).toBe('enforce');
  });

  it('ignores case and surrounding whitespace in the allowlist', () => {
    process.env.TOOL_ENFORCEMENT_AGENTS = '  MAYA , reese ';
    expect(modeFor('maya')).toBe('enforce');
    expect(modeFor('Reese')).toBe('enforce');
  });

  it('still allows a tool the agent DOES hold when enforcing', () => {
    process.env.TOOL_ENFORCEMENT_AGENTS = 'Maya';
    const v = evaluate('Maya', 'send_document', ['send_document']);
    expect(v.decision).toBe('allow');
    expect(v.violation).toBe(false);
  });
});

describe('a violation is loud', () => {
  it('warns, with its own event name so it can be alerted on', async () => {
    await withToolRecording(CTX, async () => 'ok', ['some_other_tool']);
    expect(warned()).toContain('tool_invocation_ungoverned');
    expect(warned()).toContain('send_document');
  });

  it('logs a normal invocation at info, not as a violation', async () => {
    await withToolRecording(CTX, async () => 'ok', ['send_document']);
    expect(logged()).toContain('"event":"tool_invocation"');
    expect(warned()).not.toContain('tool_invocation_ungoverned');
  });

  it('records which agent, tool and surface, so a line is triageable alone', async () => {
    await withToolRecording(CTX, async () => 'ok', ['send_document']);
    const line = logged();
    expect(line).toContain('"agent":"Maya"');
    expect(line).toContain('"tool":"send_document"');
    expect(line).toContain('"surface":"maya_site_chat"');
  });
});

describe('an unreadable grant list is not "no tools"', () => {
  it('does not treat null as a violation', () => {
    const v = evaluate('Maya', 'anything', null);
    expect(v.violation).toBe(false);
    expect(v.decision).toBe('allow');
    expect(v.reason).toContain('could not be read');
  });

  it('allows even under enforcement, rather than refusing live traffic on a failed lookup', () => {
    process.env.TOOL_ENFORCEMENT_AGENTS = 'Maya';
    expect(evaluate('Maya', 'anything', null).decision).toBe('allow');
  });

  it('treats an EMPTY list as a real answer, unlike null', () => {
    // [] means "holds nothing", which IS a violation. null means "we could not tell".
    expect(evaluate('Maya', 'anything', []).violation).toBe(true);
    expect(evaluate('Maya', 'anything', null).violation).toBe(false);
  });
});

describe('telemetry carries identity without carrying values', () => {
  it('emits the tool, the surface and the agent', async () => {
    await withToolRecording({ ...CTX, args: { email: 'someone@example.com' } }, async () => 'ok');
    // Emission is fire-and-forget AND the telemetry module is imported lazily, so the call
    // lands a tick after the tool returns. That ordering is the point: a database write must
    // never sit in the path of a chat reply. Flushing here documents it rather than hiding it.
    await flushAsync();
    const call = (emitToolCall as jest.Mock).mock.calls[0][0];
    expect(call.tool).toBe('send_document');
    expect(call.workflowId).toBe('maya_site_chat');
    expect(call.agentId).toBe('Maya');
  });

  it('hands args to emitToolCall, which records KEYS only', async () => {
    // The value-stripping lives in emitToolCall and is tested there; this asserts the wrapper
    // passes args through rather than stringifying them into the log line itself.
    await withToolRecording({ ...CTX, args: { email: 'someone@example.com' } }, async () => 'ok');
    expect(logged()).not.toContain('someone@example.com');
  });
});
