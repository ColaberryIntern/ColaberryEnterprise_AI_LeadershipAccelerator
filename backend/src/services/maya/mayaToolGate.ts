import { governanceForTool, type MayaToolCapability } from './mayaToolGovernance';
import { resolveMayaMode, type MayaMode } from './mayaPromotion';

/**
 * THE ENFORCING GATE at the top of both tool dispatchers.
 *
 * -- WHY THIS IS THE FIRST ENFORCEMENT, DESPITE APPEARANCES --
 *
 * `agents/tools/toolInvocationRecorder.withToolRecording` already wraps every Maya tool call
 * and already computes an authorization verdict, which makes it look like the gate. It is not.
 * It computes that verdict in a `finally` block, AFTER `await run()` has returned - so the
 * verdict describes a tool that has already executed. It also takes a `heldTools` list, and
 * Maya passes none. It is a RECORDER, and an accurate one; it was never able to refuse.
 *
 * This is the first thing in this codebase that can stop a Maya tool from running.
 *
 * -- IT BLOCKS ONLY `off`, AND THAT IS THE DESIGN, NOT A GAP --
 *
 * The first draft of the plan had the gate block the handler for `review` too. An audit caught
 * that it would produce a queue row with no subject and no body: `review` means a person
 * approves the MESSAGE, so the message has to exist, so the handler has to run and compose it.
 *
 * Hence the split that the whole run turns on. This gate governs whether Maya ACTS at all.
 * `deliverOrQueue.ts` governs whether what she composed DELIVERS. A tool at `review` runs,
 * composes, and its outbound effect queues; a tool at `off` never runs.
 *
 * -- AN UNGOVERNED TOOL IS BLOCKED, NOT WAVED THROUGH --
 *
 * A tool with no entry in the governance map has no capability, so there is nothing to resolve
 * and no basis on which to allow it. It is refused. That makes adding a thirteenth tool without
 * a capability a visible failure at the first call rather than a silent ungoverned path, which
 * is the state the site chat was in before this run.
 */

export interface MayaToolGateDecision {
  blocked: boolean;
  capability?: MayaToolCapability;
  mode?: MayaMode;
  /** Present only when blocked. A sentence fit to say to the person, never a code. */
  message?: string;
}

/**
 * What Maya says when a capability is off.
 *
 * These are refusals BY NAME, which is the posture Ali asked for: she says plainly that she
 * cannot do the thing and offers what she can do instead. She does not say it failed, does not
 * imply it is coming, and does not quietly do something adjacent.
 */
export function capabilityRefusalSentence(capability: MayaToolCapability): string {
  switch (capability) {
    case 'sendSmsSummary':
      return 'I am not able to send text messages. I can email you a summary instead, or have '
        + 'someone from the team call you.';
    case 'placeVoiceCall':
      return 'I am not able to place calls myself. I can have a member of the team call you, '
        + 'usually the same day, if you tell me the best number and time.';
    case 'enrollInCampaign':
      return 'I have not added you to any mailing list. A person handles that here, so nothing '
        + 'goes out without them.';
    case 'sendDocument':
      return 'I am not able to email that right now. I have made a note so a member of the '
        + 'admissions team can send it to you directly.';
    default:
      return 'That is switched off at the moment, so I have not done it. A member of the team '
        + 'can help with it directly.';
  }
}

/**
 * Decide whether a tool may run at all.
 *
 * Called at the top of `executeMayaActionInner` and `executeMayaPortalToolInner`, before the
 * switch, so there is one place to add a tool and one place that decides.
 */
export async function guardMayaTool(toolName: string): Promise<MayaToolGateDecision> {
  const entry = governanceForTool(toolName);
  if (!entry) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'maya',
      event: 'maya_tool_ungoverned', outcome: 'failure', error_class: 'ContractViolation',
      context: { tool: toolName },
    }));
    return {
      blocked: true,
      message: 'I am not set up to do that. A member of the team can help with it directly.',
    };
  }

  const { mode } = await resolveMayaMode(entry.capability);
  if (mode !== 'off') return { blocked: false, capability: entry.capability, mode };

  console.log(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'maya',
    event: 'maya_tool_refused', outcome: 'failure', error_class: 'CapabilityOff',
    context: { tool: toolName, capability: entry.capability, effect_class: entry.effectClass },
  }));
  return {
    blocked: true,
    capability: entry.capability,
    mode,
    message: capabilityRefusalSentence(entry.capability),
  };
}
