/**
 * toolScaffold — turn an approved tool request into the three files a human still has to write
 * by hand, so the one step that must stay in code is typing-free. PURE, no I/O.
 *
 * AF11.6. The handoff: *approval should emit everything needed to implement the tool, so the
 * code step is mechanical.*
 *
 * ## WHY THIS EMITS INSTEAD OF REGISTERING
 *
 * Registration is COMPILE-TIME and Ali chose on 15 Oct to keep it that way.
 * `registeredHandlerToolNames()` reads TypeScript constants — `REESE_TOOLS`, `DARA_TOOLS` — so a
 * tool cannot be created from the UI, and any design promising otherwise is promising something
 * the runtime cannot do. Given that, the way to make the code step cheap is to make approval
 * produce its inputs. The request already collects the four fields a schema needs, so nothing
 * has to be invented at emit time.
 *
 * ## IT WRITES NOTHING TO DISK, AND THAT IS THE "NEVER OVER AN EXISTING FILE" RULE KEPT
 *
 * The ticket requires emitting *"into a reviewable location, never directly over an existing
 * file."* This module returns the three files as STRINGS with their intended paths, and the
 * route hands them to a human to review and commit. Nothing is written, so nothing can be
 * overwritten — which is a stronger guarantee than checking for existence before writing, and it
 * also means the emitter cannot fail on a read-only container filesystem.
 *
 * ## THE EMITTED TEST MUST FAIL, AND THAT FAILURE IS THE DELIVERABLE
 *
 * The ticket is blunt about the trap: *"A stub whose test passes while the handler is empty is
 * worse than emitting nothing, because a green suite over an unimplemented tool is a false
 * report that survives review."*
 *
 * So the stub THROWS `ToolNotImplementedError`, and the emitted test asserts the handler returns
 * the declared shape. With the stub in place that test fails, loudly and by name. It goes green
 * when, and only when, somebody writes the body. `toolScaffold.test.ts` proves both halves by
 * executing the emitted code rather than by reading it.
 *
 * ## WHAT IS DELIBERATELY NOT EMITTED
 *
 * No handler body, no registration line, no deploy. Emitting a registration line would be the
 * data-driven registry the ticket rules out; emitting a body would be guessing at the thing the
 * human is there to decide.
 */

/** The fields a scaffold is built from. A subset of the AF11.1 detail, named the same. */
export interface ScaffoldSource {
  readonly tool_name: string;
  readonly purpose: string;
  readonly reads: ReadonlyArray<string>;
  readonly produces: ReadonlyArray<string>;
  readonly inputs: ReadonlyArray<string>;
  readonly writes: boolean;
  readonly capability_id: string;
  readonly domain_key: string;
}

export interface EmittedFile {
  /** Where a human should put it. Relative to the repo root. */
  readonly path: string;
  readonly contents: string;
}

export interface ToolScaffold {
  readonly tool_name: string;
  readonly schema: EmittedFile;
  readonly handler: EmittedFile;
  readonly test: EmittedFile;
  /** What a human still has to do, in order. The scaffold is not the tool. */
  readonly remaining_steps: ReadonlyArray<string>;
}

/** `read_cron_registry` stays as it is; anything else becomes a legal identifier. */
export function toIdentifier(toolName: string): string {
  const cleaned = String(toolName ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'unnamed_tool';
}

/** `read_cron_registry` -> `readCronRegistry`, for the handler's exported name. */
export function toCamel(toolName: string): string {
  return toIdentifier(toolName).replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase());
}

/**
 * One input line becomes one property.
 *
 * Every property is a STRING and every one is required, which is deliberate under-specification:
 * the request records inputs as prose ("A community id", "A lookback window in days") and
 * inventing a type from prose would be a guess that then has to be unpicked. A human narrows it
 * while writing the body, which is the step this scaffold exists to make cheap rather than to
 * remove.
 */
function propertiesFrom(inputs: ReadonlyArray<string>): {
  properties: Record<string, { type: 'string'; description: string }>;
  required: string[];
} {
  const properties: Record<string, { type: 'string'; description: string }> = {};
  const required: string[] = [];
  for (const raw of inputs) {
    const description = String(raw ?? '').trim();
    if (!description) continue;
    const key = toIdentifier(description).slice(0, 40) || `arg_${required.length + 1}`;
    if (properties[key]) continue;
    properties[key] = { type: 'string', description };
    required.push(key);
  }
  return { properties, required };
}

const q = (s: string): string => JSON.stringify(String(s ?? ''));

/**
 * Build the three files.
 *
 * Pure and deterministic: the same request emits the same bytes every time, so re-emitting after
 * a request is edited produces a readable diff rather than a reshuffle.
 */
export function buildToolScaffold(source: ScaffoldSource): ToolScaffold {
  const name = toIdentifier(source.tool_name);
  const camel = toCamel(source.tool_name);
  const { properties, required } = propertiesFrom(source.inputs);
  const dir = `backend/src/services/agentDomain/scaffold/${name}`;

  const schemaBody = JSON.stringify(
    {
      type: 'function',
      function: {
        name,
        description: String(source.purpose ?? '').trim(),
        parameters: { type: 'object', properties, required },
      },
    },
    null,
    2,
  );

  const schema: EmittedFile = {
    path: `${dir}/${name}.schema.ts`,
    contents: `/**
 * EMITTED BY AF11.6 from the approved tool request for ${name}.
 *
 * Capability: ${source.capability_id}
 * Domain: ${source.domain_key}
 *
 * This is the OpenAI tool schema the runtime expects, in the same shape as REESE_TOOLS in
 * backend/src/services/reese/reeseTools.ts. Registration is compile-time: adding this constant
 * to the agent's tool list is a human step, on purpose, and nothing in the product does it.
 *
 * Every parameter is typed string because the request records inputs as prose. Narrow them while
 * you write the handler.
 */
import type OpenAI from 'openai';

export const ${camel}Schema: OpenAI.Chat.ChatCompletionTool = ${schemaBody};
`,
  };

  const handler: EmittedFile = {
    path: `${dir}/${name}.handler.ts`,
    contents: `/**
 * EMITTED BY AF11.6 from the approved tool request for ${name}.
 *
 * WHAT THIS TOOL IS FOR
 * ${String(source.purpose ?? '').trim()}
 *
 * IT READS
${(source.reads.length ? source.reads : ['(nothing recorded)']).map((r) => ` *   - ${r}`).join('\n')}
 *
 * IT PRODUCES
${(source.produces.length ? source.produces : ['(nothing recorded)']).map((r) => ` *   - ${r}`).join('\n')}
 *
 * IT ${source.writes
    ? 'WRITES. Read the side effects and reversibility on the request before you implement it.'
    : 'DOES NOT WRITE. Keep it that way: a read tool that starts writing is a different grant.'}
 *
 * THIS THROWS ON PURPOSE. The emitted test fails until you replace the body, and that failure is
 * the deliverable: a stub whose test passes while the handler is empty is a green suite over an
 * unimplemented tool, which is a false report that survives review.
 */

export class ToolNotImplementedError extends Error {
  constructor(toolName: string) {
    super(\`\${toolName} has been approved and scaffolded, but nobody has implemented it yet.\`);
    this.name = 'ToolNotImplementedError';
  }
}

export interface ${camel}Args {
${required.length
  ? required.map((k) => `  /** ${properties[k].description} */\n  readonly ${k}: string;`).join('\n')
  : '  // The request declared no inputs.'}
}

export interface ${camel}Result {
  // Shape this from what the request says it produces, then narrow the test below to match.
  readonly produced: unknown;
}

export async function ${camel}(args: ${camel}Args): Promise<${camel}Result> {
  void args;
  throw new ToolNotImplementedError(${q(name)});
}
`,
  };

  const test: EmittedFile = {
    path: `${dir}/__tests__/${name}.test.ts`,
    contents: `/**
 * EMITTED BY AF11.6 from the approved tool request for ${name}.
 *
 * THIS TEST FAILS UNTIL THE HANDLER IS IMPLEMENTED, and that is the point. Do not delete it, do
 * not skip it, and do not make it pass by asserting the throw: asserting the stub throws would
 * be a green suite over a tool that does nothing, which is exactly the false report AF11.6
 * exists to prevent.
 *
 * Replace the body of the handler, then narrow the assertion to what the tool really produces.
 */

import { ${camel} } from '../${name}.handler';

describe('${name}', () => {
  it('returns what the request says it produces, rather than throwing', async () => {
    const result = await ${camel}(${required.length
      ? `{\n${required.map((k) => `      ${k}: 'replace-me',`).join('\n')}\n    }`
      : '{}'});
    expect(result).toBeDefined();
    expect(result.produced).toBeDefined();
  });
});
`,
  };

  return {
    tool_name: name,
    schema,
    handler,
    test,
    remaining_steps: Object.freeze([
      `Create ${dir} and add the three files.`,
      'Replace the handler body. The emitted test fails until you do, by design.',
      `Narrow ${camel}Args and ${camel}Result from string to the real shapes.`,
      `Register ${camel}Schema on the agent's tool list by hand. Registration is compile-time and nothing in the product does it for you.`,
      'Deploy, then grant the tool through the review console. A grant is a separate decision from a build.',
    ]),
  };
}
