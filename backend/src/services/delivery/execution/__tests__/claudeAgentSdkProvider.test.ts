/**
 * The Claude Agent SDK provider.
 *
 * Every test injects a fake SDK. Nothing here loads the real package or touches the
 * network — a provider test that needed either would be an integration test wearing a unit
 * test's name, and would be skipped the first time it flaked.
 */

import {
  DENIED_TOOLS,
  createClaudeAgentSdkProvider,
  filesFromMessage,
  normalizeMessage,
  type AgentSdkMessage,
  type AgentSdkModule,
  type AgentSdkOptions,
} from '../claudeAgentSdkProvider';
import type { WorkspaceHandle } from '../executionProviderContract';

const WORKSPACE: WorkspaceHandle = {
  workspaceId: 'ws-1',
  rootPath: '/runner/work/repo',
  repoUrl: 'https://github.com/example/repo.git',
  baseSha: 'a'.repeat(40),
  branch: 'story/abc',
};

/** A fake SDK that yields the given messages and records the options it was called with. */
function fakeSdk(messages: AgentSdkMessage[]) {
  const calls: Array<{ prompt: string; options?: AgentSdkOptions }> = [];
  const mod: AgentSdkModule = {
    query: (args) => {
      calls.push(args);
      return {
        async *[Symbol.asyncIterator]() {
          for (const m of messages) yield m;
        },
      };
    },
  };
  return { mod, calls };
}

const run = (provider: ReturnType<typeof createClaudeAgentSdkProvider>, maxDurationSeconds = 60) =>
  provider.execute({
    workspace: WORKSPACE,
    prompt: 'ASSEMBLED PROMPT',
    riskLevel: 'R2',
    maxDurationSeconds,
    correlationId: 'corr-1',
  });

// ---------------------------------------------------------------------------
// Message normalization
// ---------------------------------------------------------------------------

describe('normalizeMessage', () => {
  const at = new Date('2026-08-25T12:00:00Z');

  it('maps the documented message types onto Gate 8 event kinds', () => {
    expect(normalizeMessage({ type: 'tool_use', name: 'Bash' }, at).kind).toBe('tool_use');
    expect(normalizeMessage({ type: 'error' }, at).kind).toBe('error');
    expect(normalizeMessage({ type: 'result' }, at).kind).toBe('complete');
    expect(normalizeMessage({ type: 'text' }, at).kind).toBe('message');
  });

  it('tolerates an unknown message type instead of throwing', () => {
    // The SDK's message union grows between versions. A provider that threw on an
    // unrecognised type would turn an additive upstream release into a failed delivery.
    const event = normalizeMessage({ type: 'some_future_type' }, at);
    expect(event.kind).toBe('message');
    expect(event.summary).toContain('some_future_type');
  });

  it('tolerates a message with no type at all', () => {
    expect(normalizeMessage({}, at).summary).toBe('unknown');
  });

  it('NEVER carries the raw payload through', () => {
    // An SDK message can contain file contents and tool output. Gate 8's redaction applies
    // to events too.
    const event = normalizeMessage(
      { type: 'tool_use', name: 'Read', input: { file_path: '/x' }, result: 'SECRET FILE BODY' },
      at,
    );
    expect(event.detail).toBeNull();
    expect(JSON.stringify(event)).not.toContain('SECRET FILE BODY');
  });

  it('extracts changed file paths when the message reports one', () => {
    expect(filesFromMessage({ type: 'tool_use', input: { file_path: '/a/b.ts' } })).toEqual(['/a/b.ts']);
    expect(filesFromMessage({ type: 'tool_use', input: { path: '/c.ts' } })).toEqual(['/c.ts']);
    expect(filesFromMessage({ type: 'text' })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

describe('createClaudeAgentSdkProvider', () => {
  it('identifies itself as the engine Gate 8 recorded', () => {
    expect(createClaudeAgentSdkProvider({ loader: async () => fakeSdk([]).mod }).name).toBe(
      'claude_agent_sdk',
    );
  });

  it('completes a clean run and reports changed files', async () => {
    const { mod } = fakeSdk([
      { type: 'text' },
      { type: 'tool_use', name: 'Edit', input: { file_path: '/runner/work/repo/src/a.ts' } },
      { type: 'result' },
    ]);
    const outcome = await run(createClaudeAgentSdkProvider({ loader: async () => mod }));

    expect(outcome.completed).toBe(true);
    expect(outcome.filesChanged).toEqual(['/runner/work/repo/src/a.ts']);
    expect(outcome.events.map((e) => e.kind)).toEqual(['message', 'tool_use', 'complete']);
  });

  it('passes the ASSEMBLED prompt through unchanged', async () => {
    // The contract takes an assembled prompt precisely so a provider cannot rebuild it and
    // bypass the §11 separation between policy and untrusted content.
    const { mod, calls } = fakeSdk([{ type: 'result' }]);
    await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    expect(calls[0].prompt).toBe('ASSEMBLED PROMPT');
  });

  it('runs in the workspace, never on the backend host', async () => {
    const { mod, calls } = fakeSdk([{ type: 'result' }]);
    await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    expect(calls[0].options?.cwd).toBe(WORKSPACE.rootPath);
  });

  it('denies the network tools on every run', async () => {
    const { mod, calls } = fakeSdk([{ type: 'result' }]);
    await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    for (const tool of DENIED_TOOLS) {
      expect(calls[0].options?.disallowedTools).toContain(tool);
    }
  });

  it('bounds the run with maxTurns', async () => {
    const { mod, calls } = fakeSdk([{ type: 'result' }]);
    await run(createClaudeAgentSdkProvider({ loader: async () => mod, maxTurns: 7 }));
    expect(calls[0].options?.maxTurns).toBe(7);
  });

  it('reports an engine error as a failed run, not a thrown exception', async () => {
    const { mod } = fakeSdk([{ type: 'error' }]);
    const outcome = await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    expect(outcome.completed).toBe(false);
    expect(outcome.failureReason).toMatch(/error/i);
  });

  it('turns a missing SDK into a failed run, NEVER a crash', async () => {
    // Gate 8's rule: nothing in the execution plane may fail at boot, and an optional
    // engine that is not installed must not take the server with it.
    const provider = createClaudeAgentSdkProvider({
      loader: async () => {
        throw new Error("Cannot find module '@anthropic-ai/claude-agent-sdk'");
      },
    });
    const outcome = await run(provider);
    expect(outcome.completed).toBe(false);
    expect(outcome.failureReason).toMatch(/unavailable/i);
    expect(outcome.events[0].kind).toBe('error');
  });

  it('rejects an SDK that does not expose query()', async () => {
    const provider = createClaudeAgentSdkProvider({
      loader: async () => ({}) as unknown as AgentSdkModule,
    });
    const outcome = await run(provider);
    expect(outcome.completed).toBe(false);
  });

  it('reports a thrown stream error as failure, with the events so far', async () => {
    const mod: AgentSdkModule = {
      query: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'text' } as AgentSdkMessage;
          throw new Error('upstream exploded');
        },
      }),
    };
    const outcome = await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    expect(outcome.completed).toBe(false);
    expect(outcome.failureReason).toContain('upstream exploded');
    expect(outcome.events.length).toBeGreaterThanOrEqual(2);
  });

  it('TIMES OUT rather than running forever, and says it timed out', async () => {
    // The ceiling is the contract's, and a run that hits it must be reported as timed out
    // rather than as an engine fault — they need different responses.
    // The stream must outlast the ceiling for the timeout to be the thing that ends it.
    // `maxDurationSeconds: 0` clamps to 1s in the provider, so this waits 1.6s.
    const mod: AgentSdkModule = {
      query: (args) => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'text' } as AgentSdkMessage;
          await new Promise((resolve) => setTimeout(resolve, 1_600));
          if (args.options?.abortController?.signal.aborted) throw new Error('aborted');
          yield { type: 'result' } as AgentSdkMessage;
        },
      }),
    };
    const provider = createClaudeAgentSdkProvider({ loader: async () => mod });
    const outcome = await provider.execute({
      workspace: WORKSPACE,
      prompt: 'p',
      riskLevel: 'R2',
      maxDurationSeconds: 0, // clamped to 1s
      correlationId: 'corr-timeout',
    });
    expect(outcome.completed).toBe(false);
    expect(outcome.failureReason).toMatch(/ceiling/i);
  }, 10_000);

  it('supplies an abortController the engine can observe', async () => {
    const { mod, calls } = fakeSdk([{ type: 'result' }]);
    await run(createClaudeAgentSdkProvider({ loader: async () => mod }));
    expect(calls[0].options?.abortController).toBeInstanceOf(AbortController);
  });
});
