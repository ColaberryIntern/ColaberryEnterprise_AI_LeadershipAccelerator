/**
 * claudeAgentSdkProvider — the ExecutionProvider backed by `@anthropic-ai/claude-agent-sdk`.
 *
 * This fills the seam Gate 8 deliberately left empty. Gate 8 declared `ExecutionProvider`
 * and wrote no binding, because writing SDK calls from memory is how a
 * plausible-but-wrong integration ships. The binding is written now, against the
 * documented API at `code.claude.com/docs/en/agent-sdk/typescript`, read first.
 *
 * ## Two facts about the package that shape this file
 *
 * **1. The SDK is ESM-only.** `@anthropic-ai/claude-agent-sdk@0.3.245` publishes
 * `main: sdk.mjs`. This backend is `"module": "commonjs"` with no `"type": "module"`.
 *
 * **2. TypeScript compiling to CommonJS rewrites `import()` into `require()`.** So the
 * obvious fix — a dynamic import — is silently downlevelled into exactly the thing that
 * cannot load an ES module, and the failure appears at runtime in production rather than
 * at compile time here. The `new Function('s', 'return import(s)')` indirection below is
 * the standard escape: TypeScript cannot see through it, so a genuine dynamic `import()`
 * survives into the emitted JavaScript.
 *
 * That indirection looks like a hack and is load-bearing. Removing it "for clarity" breaks
 * loading, and breaks it only once deployed.
 *
 * ## Why the import is lazy at all
 *
 * Gate 8's rule that nothing may fail at boot. The delivery domain loads on every backend
 * start; an execution engine that is only needed when a run is claimed must not be a boot
 * dependency, and must not turn a missing optional package into a crashed server.
 */

import type {
  ExecutionEvent,
  ExecutionOutcome,
  ExecutionProvider,
  WorkspaceHandle,
} from './executionProviderContract';
import type { DeliveryRiskLevel } from '../../../modules/delivery/deliveryRiskLevels';

/** The npm package. Declared in one place so a rename is one edit. */
export const AGENT_SDK_PACKAGE = '@anthropic-ai/claude-agent-sdk';

/**
 * The slice of the SDK surface this provider uses, mirrored from the documented API.
 *
 * Narrow on purpose: a local interface over someone else's package is a promise about what
 * we depend on. Every field here appears in the published TypeScript docs; nothing is
 * inferred from a guess about what probably exists.
 */
export interface AgentSdkOptions {
  model?: string;
  cwd?: string;
  maxTurns?: number;
  allowedTools?: string[];
  disallowedTools?: string[];
  permissionMode?: string;
  abortController?: AbortController;
  systemPrompt?:
    | string
    | { type: 'preset'; preset: 'claude_code'; append?: string };
}

/** `query()` returns an AsyncGenerator of messages. We read `type` and little else. */
export type AgentSdkMessage = { type?: string; [key: string]: unknown };

export type AgentSdkQuery = (args: {
  prompt: string;
  options?: AgentSdkOptions;
}) => AsyncIterable<AgentSdkMessage>;

export interface AgentSdkModule {
  query: AgentSdkQuery;
}

/**
 * A dynamic import TypeScript cannot downlevel to `require`.
 *
 * See the header. `new Function` is evaluated by the JS engine at call time, so the
 * compiler emits it verbatim and the runtime performs a real ESM import.
 */
const nativeDynamicImport: (specifier: string) => Promise<any> = new Function(
  'specifier',
  'return import(specifier)',
) as any;

export async function loadAgentSdk(): Promise<AgentSdkModule> {
  const mod = await nativeDynamicImport(AGENT_SDK_PACKAGE);
  const query = (mod?.query ?? mod?.default?.query) as AgentSdkQuery | undefined;
  if (typeof query !== 'function') {
    throw new Error(
      `${AGENT_SDK_PACKAGE} loaded but exports no query() function. ` +
        'The provider will not run against an unrecognised SDK shape.',
    );
  }
  return { query };
}

/**
 * Tools denied to every run, derived from Gate 8's default-deny list.
 *
 * `WebFetch` and `WebSearch` are denied because `unbounded_network` is a denied capability
 * and untrusted repository content plus arbitrary egress is an exfiltration path. This is
 * defence in depth, not the boundary — the boundary is the isolated runner (ESC-4). A tool
 * denial in the harness does not constrain a compromised runner, and saying so is part of
 * the control rather than a caveat on it.
 */
export const DENIED_TOOLS: readonly string[] = ['WebFetch', 'WebSearch'];

/** Turns permitted before a run is considered runaway. */
export const DEFAULT_MAX_TURNS = 40;

export interface ClaudeAgentSdkProviderConfig {
  /** Injected so tests never touch the real SDK, and never touch the network. */
  loader?: () => Promise<AgentSdkModule>;
  model?: string;
  maxTurns?: number;
  now?: () => number;
}

/**
 * Normalize one SDK message into Gate 8's engine-agnostic `ExecutionEvent`.
 *
 * Deliberately tolerant. The SDK's message union has grown between versions, and a
 * provider that throws on an unrecognised `type` would turn a additive upstream release
 * into a failed client delivery. Unknown types become a `message` event, which is honest:
 * something happened, and we did not classify it.
 */
export function normalizeMessage(message: AgentSdkMessage, at: Date): ExecutionEvent {
  const type = typeof message.type === 'string' ? message.type : 'unknown';

  const kind: ExecutionEvent['kind'] =
    type === 'tool_use'
      ? 'tool_use'
      : type === 'error'
        ? 'error'
        : type === 'result'
          ? 'complete'
          : 'message';

  // Never carry raw payloads through. The prompt envelope's redaction applies to events
  // too (Gate 8), and an SDK message can contain file contents and tool output.
  const summary =
    typeof message.name === 'string'
      ? `${type}: ${message.name}`
      : typeof message.subtype === 'string'
        ? `${type}: ${message.subtype}`
        : type;

  return { at, kind, summary, detail: null };
}

/** Files an SDK message reports as written or edited, when it says so. */
export function filesFromMessage(message: AgentSdkMessage): string[] {
  const input = message.input as Record<string, unknown> | undefined;
  const path = input?.file_path ?? input?.path;
  return typeof path === 'string' ? [path] : [];
}

/**
 * The provider.
 *
 * Takes an **assembled** prompt, per Gate 8's contract — it never builds one. That is what
 * stops a provider implementation from bypassing the §11 region separation between system
 * policy, approved decisions and untrusted repository content.
 */
export function createClaudeAgentSdkProvider(
  config: ClaudeAgentSdkProviderConfig = {},
): ExecutionProvider {
  const load = config.loader ?? loadAgentSdk;

  return {
    name: 'claude_agent_sdk',

    async execute(input: {
      workspace: WorkspaceHandle;
      prompt: string;
      riskLevel: DeliveryRiskLevel;
      maxDurationSeconds: number;
      correlationId: string;
    }): Promise<ExecutionOutcome> {
      const events: ExecutionEvent[] = [];
      const filesChanged = new Set<string>();

      let sdk: AgentSdkModule;
      try {
        sdk = await load();
      } catch (err: any) {
        // A missing or unrecognised SDK is a failed run, never a thrown boot error.
        return {
          completed: false,
          events: [
            {
              at: new Date(),
              kind: 'error',
              summary: 'agent sdk unavailable',
              detail: { message: err?.message ?? String(err) },
            },
          ],
          filesChanged: [],
          failureReason: `Execution engine unavailable: ${err?.message ?? String(err)}`,
        };
      }

      // The hard ceiling from the contract. A run that hits it is timed out, never
      // silently truncated — so the abort is what ends it, and the outcome says so.
      const abortController = new AbortController();
      let timedOut = false;
      const timer = setTimeout(
        () => {
          timedOut = true;
          abortController.abort();
        },
        Math.max(1, input.maxDurationSeconds) * 1000,
      );

      try {
        const stream = sdk.query({
          prompt: input.prompt,
          options: {
            cwd: input.workspace.rootPath,
            model: config.model,
            maxTurns: config.maxTurns ?? DEFAULT_MAX_TURNS,
            disallowedTools: [...DENIED_TOOLS],
            abortController,
          },
        });

        for await (const message of stream) {
          const event = normalizeMessage(message, new Date());
          events.push(event);
          for (const file of filesFromMessage(message)) filesChanged.add(file);
        }

        if (timedOut) {
          return {
            completed: false,
            events,
            filesChanged: [...filesChanged],
            failureReason: `Run exceeded its ${input.maxDurationSeconds}s ceiling and was aborted.`,
          };
        }

        const errored = events.some((e) => e.kind === 'error');
        return {
          completed: !errored,
          events,
          filesChanged: [...filesChanged],
          failureReason: errored ? 'The engine reported an error during the run.' : null,
        };
      } catch (err: any) {
        // An abort surfaces here as a thrown error on many stream implementations. It is
        // a timeout, not an engine fault, and the outcome must not misreport which.
        if (timedOut) {
          return {
            completed: false,
            events,
            filesChanged: [...filesChanged],
            failureReason: `Run exceeded its ${input.maxDurationSeconds}s ceiling and was aborted.`,
          };
        }
        events.push({
          at: new Date(),
          kind: 'error',
          summary: 'execution failed',
          detail: { message: err?.message ?? String(err) },
        });
        return {
          completed: false,
          events,
          filesChanged: [...filesChanged],
          failureReason: err?.message ?? String(err),
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
