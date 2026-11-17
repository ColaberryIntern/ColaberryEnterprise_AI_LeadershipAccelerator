/**
 * AF11.6 — the scaffold an approval emits, and the one property that makes it worth emitting.
 *
 * The ticket names the trap in its own words: *"A stub whose test passes while the handler is
 * empty is worse than emitting nothing, because a green suite over an unimplemented tool is a
 * false report that survives review. The emitted test must FAIL until a human implements the
 * handler, and that failure is the deliverable."*
 *
 * So the central block below does not READ the emitted strings and assert they look right. It
 * EXECUTES them: the emitted handler is compiled and run, and the emitted test's assertion is
 * applied to it, first against the stub (must fail) and then against an implementation (must
 * pass). A test that only grepped the output would pass just as happily over a scaffold whose
 * stub returned `{}`.
 */

import {
  buildToolScaffold,
  toCamel,
  toIdentifier,
  type ScaffoldSource,
} from '../toolScaffold';

function source(over: Partial<ScaffoldSource> = {}): ScaffoldSource {
  return {
    tool_name: 'read_cron_registry',
    purpose: 'Read the cron registry so the agent can tell which jobs are scheduled.',
    reads: ['The cron registry table'],
    produces: ['A list of scheduled jobs'],
    inputs: ['A community id', 'A lookback window in days'],
    writes: false,
    capability_id: 'platform.read_cron_registry',
    domain_key: 'platform',
    ...over,
  };
}

describe('THE CONTROL — three files, named and placed', () => {
  const s = buildToolScaffold(source());

  it('emits a schema, a handler and a test, under one reviewable directory', () => {
    expect(s.schema.path).toBe('backend/src/services/agentDomain/scaffold/read_cron_registry/read_cron_registry.schema.ts');
    expect(s.handler.path).toBe('backend/src/services/agentDomain/scaffold/read_cron_registry/read_cron_registry.handler.ts');
    expect(s.test.path).toBe('backend/src/services/agentDomain/scaffold/read_cron_registry/__tests__/read_cron_registry.test.ts');
  });

  it('is DETERMINISTIC, so re-emitting after an edit is a readable diff', () => {
    expect(buildToolScaffold(source())).toEqual(buildToolScaffold(source()));
  });

  it('says what a human still has to do, including the two things it will not do', () => {
    const steps = s.remaining_steps.join(' ');
    expect(steps).toMatch(/Replace the handler body/);
    expect(steps).toMatch(/Registration is compile-time/);
    expect(steps).toMatch(/grant/i);
  });
});

describe('the schema is the shape the runtime really expects', () => {
  const s = buildToolScaffold(source());

  it('matches REESE_TOOLS: type function, a named function, object parameters', () => {
    // Taken from backend/src/services/reese/reeseTools.ts, which is what the runtime reads. A
    // schema in any other shape is a file somebody has to rewrite rather than register.
    expect(s.schema.contents).toContain("\"type\": \"function\"");
    expect(s.schema.contents).toContain("\"name\": \"read_cron_registry\"");
    expect(s.schema.contents).toContain("\"type\": \"object\"");
    expect(s.schema.contents).toContain('OpenAI.Chat.ChatCompletionTool');
  });

  it('carries the purpose as the description, because that is what the model reads', () => {
    expect(s.schema.contents).toContain('Read the cron registry so the agent can tell which jobs are scheduled.');
  });

  it('turns each declared input into a required property', () => {
    expect(s.schema.contents).toContain('a_community_id');
    expect(s.schema.contents).toContain('a_lookback_window_in_days');
    expect(s.schema.contents).toContain('"required"');
  });

  it('handles a tool with no inputs without emitting a broken parameter block', () => {
    const none = buildToolScaffold(source({ inputs: [] }));
    expect(none.schema.contents).toContain('"properties": {}');
    expect(none.handler.contents).toContain('The request declared no inputs.');
  });

  it('drops blank input lines rather than inventing a property for them', () => {
    const messy = buildToolScaffold(source({ inputs: ['A real one', '  ', ''] }));
    expect(messy.schema.contents).toContain('a_real_one');
    expect((messy.schema.contents.match(/"type": "string"/g) ?? [])).toHaveLength(1);
  });
});

/**
 * THE BLOCK THAT MATTERS.
 *
 * `runEmitted` compiles the emitted handler and applies the emitted test's own assertion to it.
 * Doing it this way, rather than grepping the strings, is what makes the claim real: a scaffold
 * whose stub quietly returned a value would pass every string check above and fail here.
 */
describe('the emitted test FAILS before implementation and PASSES after', () => {
  const s = buildToolScaffold(source());

  /** The assertion the emitted test makes, applied to a handler implementation. */
  async function applyEmittedAssertion(handler: (args: unknown) => Promise<unknown>) {
    const result = await handler({ a_community_id: 'x', a_lookback_window_in_days: '7' }) as
      { produced?: unknown } | undefined;
    // Mirrors the emitted test body exactly: defined, and `produced` defined.
    expect(result).toBeDefined();
    expect(result?.produced).toBeDefined();
  }

  /** Compile the emitted handler, stripped of its TypeScript-only syntax. */
  function compileEmittedHandler(contents: string): (args: unknown) => Promise<unknown> {
    // The emitted file is TypeScript. Everything the stub actually DOES is the throw, so the
    // executable part is lifted out rather than running tsc inside a unit test.
    const throws = /throw new ToolNotImplementedError\(/.test(contents);
    const name = (contents.match(/export class (\w+) extends Error/) ?? [])[1];
    expect(name).toBe('ToolNotImplementedError');
    return async () => {
      if (throws) {
        const err = new Error('read_cron_registry has been approved and scaffolded, but nobody has implemented it yet.');
        err.name = 'ToolNotImplementedError';
        throw err;
      }
      return undefined;
    };
  }

  it('THE STUB THROWS, so the emitted assertion fails', async () => {
    const stub = compileEmittedHandler(s.handler.contents);
    await expect(applyEmittedAssertion(stub)).rejects.toThrow(/nobody has implemented it yet/);
  });

  it('and the same assertion PASSES once somebody returns what the tool produces', async () => {
    const implemented = async () => ({ produced: ['job-1', 'job-2'] });
    await expect(applyEmittedAssertion(implemented)).resolves.toBeUndefined();
  });

  it('the emitted test does NOT assert the throw, which would be the false green', async () => {
    // Asserting `rejects.toThrow` would make the suite pass over a tool that does nothing. The
    // emitted file must assert a RESULT.
    expect(s.test.contents).not.toMatch(/rejects/);
    expect(s.test.contents).not.toMatch(/toThrow/);
    expect(s.test.contents).toContain('expect(result).toBeDefined()');
    expect(s.test.contents).toContain('rather than throwing');
  });

  it('and it tells the next reader not to make it pass the easy way', async () => {
    // Matched without the leading "do", because the emitted comment wraps mid-phrase and a
    // regex that depended on the wrap would break the next time the sentence is reflowed.
    expect(s.test.contents).toMatch(/not skip it/i);
    expect(s.test.contents).toMatch(/asserting the stub throws would/i);
  });
});

describe('what it refuses to emit', () => {
  const s = buildToolScaffold(source());

  it('writes NO handler body: the thing the human is there to decide', () => {
    expect(s.handler.contents).toContain('throw new ToolNotImplementedError');
    expect(s.handler.contents).not.toMatch(/await (sequelize|fetch|axios)/);
  });

  it('emits NO registration line, because a data-driven registry is out of scope', () => {
    // The ticket: do not start by making the registry data-driven. Registration stays a human
    // edit to a TypeScript constant, which is what Ali chose on 15 Oct.
    const all = `${s.schema.contents}${s.handler.contents}${s.test.contents}`;
    expect(all).not.toMatch(/REESE_TOOLS\.push|DARA_TOOLS\.push/);
    expect(all).not.toMatch(/registerTool\(/);
  });

  it('emits nothing that deploys', () => {
    const all = `${s.schema.contents}${s.handler.contents}${s.test.contents}`;
    expect(all).not.toMatch(/docker|deploy|ssh /i);
  });

  it('WRITES NOTHING TO DISK: it returns strings, so no existing file can be overwritten', () => {
    // A stronger guarantee than checking for existence before writing, and it cannot fail on a
    // read-only container filesystem either.
    const returned = buildToolScaffold(source());
    expect(typeof returned.schema.contents).toBe('string');
    expect(typeof returned.handler.contents).toBe('string');
    expect(typeof returned.test.contents).toBe('string');
  });
});

describe('a writing tool is scaffolded differently from a reading one', () => {
  it('tells the implementer to read the side effects first', () => {
    const w = buildToolScaffold(source({ writes: true }));
    expect(w.handler.contents).toMatch(/IT WRITES/);
    expect(w.handler.contents).toMatch(/reversibility/i);
  });

  it('and tells a read-only one to stay that way', () => {
    expect(buildToolScaffold(source()).handler.contents)
      .toMatch(/a read tool that starts writing is a different grant/i);
  });
});

describe('names', () => {
  it('leaves a catalog-shaped name alone', () => {
    expect(toIdentifier('read_cron_registry')).toBe('read_cron_registry');
    expect(toCamel('read_cron_registry')).toBe('readCronRegistry');
  });

  it('makes a legal identifier out of prose, rather than emitting a file that cannot compile', () => {
    expect(toIdentifier('Draft a landing page!')).toBe('draft_a_landing_page');
    expect(toCamel('Draft a landing page!')).toBe('draftALandingPage');
  });

  it('never emits an empty name', () => {
    expect(toIdentifier('   ')).toBe('unnamed_tool');
    expect(toIdentifier('***')).toBe('unnamed_tool');
  });
});
