/**
 * Every agent action carries the identity of the tool that performed it.
 *
 * Agent Tools Phase 5. Ali: *"Every action should be tied to a tool."* Enforcement posture he
 * chose on 2026-11-11: **record now, enforce later, per agent.**
 *
 * ## What was actually missing
 *
 * Six dispatch functions execute tools - `executeMayaAction`, `executeMayaPortalTool`,
 * `executeReeseTool`, `executeDaraTool`, `executeDaraStaffTool` and Cory's `executeToolCall` -
 * and measured on 2026-11-11 only two of them emitted anything at all. Reese, Dara and Maya's
 * portal tools ran silently, so "which tool did this" was unanswerable for three of the six.
 *
 * None of the six consults a grant before running. The real gate today is which tool array was
 * handed to the model, which is a decision made at deploy time by a code change, not a grant.
 *
 * ## Record now, enforce later
 *
 * `evaluate()` always returns a decision and, in record mode, that decision is always `allow`.
 * A tool the agent does not hold produces a LOUD violation line and still runs. That is
 * deliberate: with 136 ungoverned holdings across 31 agents and zero grant rows, enforcing today
 * would refuse live work, including Maya's chat, on the first tick.
 *
 * Enforcement is switched on one agent at a time through `TOOL_ENFORCEMENT_AGENTS`, a
 * comma-separated allowlist read per call so it can be flipped without a redeploy. Default empty
 * means every agent records and none enforces. The same shape as `AGENT_TOOLS_DISABLED`, which
 * this repo already uses as a kill switch.
 *
 * ## It cannot break a tool call
 *
 * `withToolRecording` never changes a result, never swallows a real error, and never throws on
 * its own. Recording failures are caught and logged. Observability that can break the thing it
 * observes is worse than none, and three of these six paths are live visitor-facing surfaces.
 */
/**
 * `aiEventService` is imported LAZILY, inside the recording path, and that is load-bearing.
 *
 * It transitively imports `config/database`, which constructs a real Sequelize at module load.
 * Importing it at the top of this file put a database connection in the import graph of all six
 * tool dispatchers, and three suites that had never needed a database died at import with
 * `The "url" argument must be of type string`. Loading it only when a tool actually runs keeps
 * the dispatchers importable without one, and by then the app has booted with a real database.
 */
async function emitToolCallLazily(params: {
  tool: string; ok: boolean; durationMs: number;
  workflowId: string; agentId: string; args?: Record<string, any>;
}): Promise<void> {
  const { emitToolCall } = await import('../../aiEventService');
  await emitToolCall(params);
}

/** Where the call came from, for the log line. Not a grant and not an identity. */
export interface ToolInvocationContext {
  /** The agent as the registry names it: 'Maya', 'Reese', 'Dara', 'Cory'. */
  agentName: string;
  toolName: string;
  /** Which surface dispatched it, e.g. 'maya_site_chat', 'reese_dm'. Free-form, for triage. */
  surface: string;
  /** The agent's `ai_agents.id`, when the caller has it. Used only for telemetry correlation. */
  agentId?: string;
  /** Argument KEYS are recorded; values never are. Passed straight to emitToolCall. */
  args?: Record<string, unknown>;
}

export type ToolGovernanceMode = 'record' | 'enforce';
export type ToolGovernanceDecision = 'allow' | 'refuse';

export interface ToolGovernanceVerdict {
  mode: ToolGovernanceMode;
  decision: ToolGovernanceDecision;
  /** True when the agent does not hold this tool. In record mode this still allows. */
  violation: boolean;
  reason: string;
}

/**
 * Agents with enforcement switched on, read per call.
 *
 * Per call rather than at import so a flip takes effect without a redeploy, which matters
 * because the first flip is the risky one and it should be reversible in seconds. Case and
 * whitespace insensitive, because an operator typing a name under pressure should not be
 * defeated by a capital letter.
 */
export function enforcedAgents(): Set<string> {
  const raw = process.env.TOOL_ENFORCEMENT_AGENTS || '';
  return new Set(
    raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
  );
}

export function modeFor(agentName: string): ToolGovernanceMode {
  return enforcedAgents().has((agentName || '').trim().toLowerCase()) ? 'enforce' : 'record';
}

/**
 * Judges one invocation against what the agent actually holds.
 *
 * `heldTools` is passed in rather than read here, so this stays a pure function the caller can
 * test and so a database read cannot sit in the hot path of a visitor-facing chat turn. A caller
 * that cannot determine the held tools passes `null`, which is NOT treated as "no tools": an
 * unreadable list is reported as its own reason and, in record mode, allowed. Refusing live
 * traffic because a lookup failed would be a worse failure than the one it guards against.
 */
export function evaluate(
  agentName: string,
  toolName: string,
  heldTools: readonly string[] | null,
): ToolGovernanceVerdict {
  const mode = modeFor(agentName);

  if (heldTools === null) {
    return {
      mode,
      decision: 'allow',
      violation: false,
      reason: 'The granted-tool list could not be read, so this call was not judged.',
    };
  }

  const held = heldTools.includes(toolName);
  if (held) {
    return { mode, decision: 'allow', violation: false, reason: 'The agent holds this tool.' };
  }

  return {
    mode,
    decision: mode === 'enforce' ? 'refuse' : 'allow',
    violation: true,
    reason: `${agentName} does not hold "${toolName}". `
      + (mode === 'enforce'
        ? 'Enforcement is on for this agent, so the call is refused.'
        : 'Recording only, so the call still ran. Switch this agent on in '
          + 'TOOL_ENFORCEMENT_AGENTS once its grants are backfilled.'),
  };
}

/** One structured line per invocation. stdout JSON, the repo's observability shape. */
function logInvocation(
  ctx: ToolInvocationContext,
  verdict: ToolGovernanceVerdict,
  outcome: { ok: boolean; durationMs: number; errorClass?: string },
): void {
  const line = {
    timestamp: new Date().toISOString(),
    level: verdict.violation ? 'warn' : 'info',
    service: 'agent-tools',
    // A violation gets its own event name so it can be alerted on without parsing a message.
    event: verdict.violation ? 'tool_invocation_ungoverned' : 'tool_invocation',
    outcome: outcome.ok ? 'success' : 'failure',
    duration_ms: outcome.durationMs,
    ...(outcome.errorClass ? { error_class: outcome.errorClass } : {}),
    context: {
      agent: ctx.agentName,
      tool: ctx.toolName,
      surface: ctx.surface,
      mode: verdict.mode,
      decision: verdict.decision,
      reason: verdict.reason,
    },
  };
  if (verdict.violation) console.warn(JSON.stringify(line));
  else console.log(JSON.stringify(line));
}

/**
 * Runs a tool call, recording which tool did it.
 *
 * NEVER changes the result and NEVER swallows the caller's error. Recording is wrapped so a
 * telemetry fault cannot take down a visitor-facing chat turn.
 *
 * `heldTools` is optional: a caller that does not know them passes nothing, and the call is
 * recorded without a governance judgement rather than being judged on a guess.
 */
export async function withToolRecording<T>(
  ctx: ToolInvocationContext,
  run: () => Promise<T>,
  heldTools?: readonly string[] | null,
): Promise<T> {
  const started = Date.now();
  let ok = true;
  let errorClass: string | undefined;
  try {
    return await run();
  } catch (err) {
    ok = false;
    errorClass = err instanceof Error ? err.constructor.name : 'UnknownError';
    throw err;
  } finally {
    const durationMs = Date.now() - started;
    try {
      const verdict = evaluate(ctx.agentName, ctx.toolName, heldTools === undefined ? null : heldTools);
      logInvocation(ctx, verdict, { ok, durationMs, errorClass });
      // Fire-and-forget: emitToolCall is itself swallow-safe, and awaiting it would put a
      // database write in the path of a chat reply. The rejection handler is required because
      // the lazy import itself can reject, and an unhandled rejection here would surface as a
      // process-level warning on a path that must stay silent when it fails.
      void emitToolCallLazily({
        tool: ctx.toolName,
        ok,
        durationMs,
        workflowId: ctx.surface,
        agentId: ctx.agentId ?? ctx.agentName,
        args: ctx.args as Record<string, any> | undefined,
      }).catch(() => { /* telemetry must never break the tool path */ });
    } catch {
      /* recording must never break the tool path */
    }
  }
}
