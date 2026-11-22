const mockResolveMode = jest.fn();

jest.mock('../mayaPromotion', () => ({
  ...jest.requireActual('../mayaPromotion'),
  resolveMayaMode: (...a: unknown[]) => mockResolveMode(...a),
}));

import { MAYA_TOOL_GOVERNANCE, governanceForTool } from '../mayaToolGovernance';
import { capabilityRefusalSentence, guardMayaTool } from '../mayaToolGate';

/**
 * T4(a) - the gate at the top of both dispatchers, and the line it draws.
 *
 * The property under test is narrow and easy to state: a tool whose capability is `off` does
 * not run, and a tool in any other mode does.
 *
 * That second half is the one worth guarding. The first draft of the plan had the gate block
 * `review` as well, which sounds safer and is not: `review` means a person approves THE
 * MESSAGE, so the message has to exist, so the handler has to run and compose it. Blocking it
 * would have produced queue rows with no subject and no body - "approved" meaning approved
 * nothing. If a later edit makes this gate block `review` or `shadow`, these tests fail.
 */

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

const asMode = (mode: string) => mockResolveMode.mockResolvedValue({ mode, reason: 'test' });

describe('T4(a) off is the only mode that stops a tool running', () => {
  it('blocks when the capability is off, and says why in a sentence', async () => {
    asMode('off');
    const decision = await guardMayaTool('send_sms_summary');
    expect(decision.blocked).toBe(true);
    expect(decision.capability).toBe('sendSmsSummary');
    expect(decision.message).toMatch(/not able to send text messages/i);
  });

  it.each([['shadow'], ['review'], ['live']])(
    'does NOT block at %s, because the handler has to compose before anything can be reviewed',
    async (mode) => {
      asMode(mode);
      const decision = await guardMayaTool('send_document');
      expect(decision).toMatchObject({ blocked: false, capability: 'sendDocument', mode });
      expect(decision.message).toBeUndefined();
    },
  );

  it('resolves the capability the governance map names, not one derived from the tool name', async () => {
    asMode('live');
    await guardMayaTool('schedule_strategy_call');
    expect(mockResolveMode).toHaveBeenCalledWith('bookStrategyCall');
  });
});

describe('T4(a) an ungoverned tool is refused, not waved through', () => {
  it('blocks a tool that has no entry in the governance map', async () => {
    const decision = await guardMayaTool('some_new_tool_nobody_mapped');
    expect(decision.blocked).toBe(true);
    // And it never even asked for a mode, because there is no capability to ask about.
    expect(mockResolveMode).not.toHaveBeenCalled();
  });

  it('refusing by default is what makes adding a tool without a capability visible', async () => {
    // The site chat ran for months with twelve tools and no capability layer at all. The point
    // of blocking here is that the same state cannot recur quietly: a thirteenth tool added
    // without a map entry fails at its first call rather than running ungoverned.
    const decision = await guardMayaTool('capture_lead_details_typo');
    expect(decision.blocked).toBe(true);
  });
});

describe('T4(a) every tool on the map can be gated', () => {
  it.each(Object.keys(MAYA_TOOL_GOVERNANCE).map((t) => [t]))(
    '%s resolves a capability rather than falling through',
    async (tool) => {
      asMode('live');
      const decision = await guardMayaTool(tool);
      expect(decision.blocked).toBe(false);
      expect(mockResolveMode).toHaveBeenCalledWith(governanceForTool(tool)!.capability);
    },
  );
});

describe('T9 (2026-11-22) voice is no longer refused at the gate', () => {
  it('initiate_voice_call at shadow passes the gate: shadow is enforced in the effect, not here', async () => {
    // The gate blocks only `off`. Voice ships `shadow`, so the phone-ringing decision lives in
    // voiceTool.initiateVoiceCall, which dials ONLY at `live`. That half is proven in
    // mayaVoiceToolHonesty.test.ts ("at mode shadow ... NOTHING is dialed").
    asMode('shadow');
    expect((await guardMayaTool('initiate_voice_call')).blocked).toBe(false);
    expect(mockResolveMode).toHaveBeenCalledWith('placeVoiceCall');
  });
});

describe('T4(a) the refusals say what she cannot do and what she can', () => {
  it.each([
    ['sendSmsSummary', /text messages/i, /email|call/i],
    ['placeVoiceCall', /place calls/i, /team call you/i],
    ['enrollInCampaign', /not added you to any mailing list/i, /person handles that/i],
  ] as Array<[string, RegExp, RegExp]>)(
    '%s names the limit and offers the alternative',
    (capability, limit, alternative) => {
      const sentence = capabilityRefusalSentence(capability as never);
      expect(sentence).toMatch(limit);
      expect(sentence).toMatch(alternative);
      // Never a code, never a capability name, never an apology for a system state.
      expect(sentence).not.toMatch(/capability|disabled|flag|error|unavailable/i);
    },
  );

  it('does not imply the thing is coming later, which would be a promise nobody made', () => {
    for (const cap of ['sendSmsSummary', 'placeVoiceCall', 'enrollInCampaign'] as const) {
      expect(capabilityRefusalSentence(cap)).not.toMatch(/soon|yet|for now|at the moment|currently/i);
    }
  });
});
