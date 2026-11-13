/**
 * Every model call on a generation path must go through the instrumented client.
 *
 * ## Why this is a source guard rather than a mock test
 *
 * The defect this exists to prevent is not "factoryDecompose constructed the wrong client once".
 * It is the CLASS: a model call on a generation path that records no model, tokens, cost or
 * duration. Production demonstrated the cost of that class. Twelve gov_* modules construct their
 * client with `getInstrumentedOpenAI`, and exactly the generation entry points did not, with the
 * result that `ai_events` held 340,173 rows and not one of them could price a decomposition. The
 * two figures L7.5 asks for, generation time and generation cost, did not exist anywhere in the
 * system for either path.
 *
 * A mock-based test would pin today's four call sites and say nothing about the fifth one someone
 * adds next month, which is the only way this regresses. So the invariant is asserted over the
 * source text of a declared list of generation modules.
 *
 * ## The control
 *
 * A detector that reports "no raw constructors" is worthless until it is shown reporting one. The
 * first test below runs the SAME detector over a synthetic module that does contain a raw
 * constructor and requires it to fire. Without that, a broken regex and a clean codebase are
 * indistinguishable, and this file would pass forever while enforcing nothing.
 */
import * as fs from 'fs';
import * as path from 'path';

const SERVICES = path.resolve(__dirname, '..');

/**
 * The modules that make a model call as part of generating a project, plan or its requirements,
 * each with the workflow_id it must report under. The id is asserted too, because an instrumented
 * client with no workflow_id lands in `ai_events` as an unattributable row, which is a different
 * way of being unmeasurable rather than a fix for it.
 */
const GENERATION_MODULES: ReadonlyArray<{ file: string; workflowId: string }> = [
  { file: 'factory/factoryDecompose.ts', workflowId: 'factory_decompose' },
  { file: 'sbp/decomposeService.ts', workflowId: 'sbp_decompose' },
  { file: 'sbp/intakeQuestionsService.ts', workflowId: 'sbp_intake_questions' },
  { file: 'sbp/modelJsonCall.ts', workflowId: 'sbp_model_json' },
];

/** The thing being detected: a direct SDK construction, which bypasses every instrument. */
const RAW_CONSTRUCTOR = /new\s+OpenAI\s*\(/;

const read = (relative: string): string =>
  fs.readFileSync(path.join(SERVICES, relative), 'utf8');

describe('the raw-constructor detector itself', () => {
  it('FIRES on a module that does construct the SDK directly', () => {
    const planted = `
      import OpenAI from 'openai';
      function defaultClient() {
        return new OpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat.completions;
      }
    `;
    expect(RAW_CONSTRUCTOR.test(planted)).toBe(true);
  });

  it('stays quiet on a module that uses the instrumented factory', () => {
    const clean = `
      import { getInstrumentedOpenAI } from '../openaiInstrumented';
      function defaultClient() {
        return getInstrumentedOpenAI({ workflow_id: 'x' }).chat.completions;
      }
    `;
    expect(RAW_CONSTRUCTOR.test(clean)).toBe(false);
  });

  it('is not fooled by the word OpenAI appearing in a type or a comment', () => {
    const typeOnly = `
      import OpenAI from 'openai';
      // We deliberately avoid new OpenAI here... except this comment would be a false positive,
      // so the real guard strips comments before testing. This case documents that limit.
      export type ChatClient = Pick<OpenAI['chat']['completions'], 'create'>;
    `;
    expect(RAW_CONSTRUCTOR.test(stripComments(typeOnly))).toBe(false);
  });
});

/** Comments are removed before the guard runs, so prose about the rule cannot trip the rule. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('generation paths are instrumented', () => {
  it.each(GENERATION_MODULES)('$file constructs no raw OpenAI client', ({ file }) => {
    const body = stripComments(read(file));
    expect(RAW_CONSTRUCTOR.test(body)).toBe(false);
  });

  it.each(GENERATION_MODULES)('$file routes through getInstrumentedOpenAI', ({ file }) => {
    const body = stripComments(read(file));
    expect(body).toContain('getInstrumentedOpenAI(');
  });

  it.each(GENERATION_MODULES)('$file declares workflow_id $workflowId', ({ file, workflowId }) => {
    const body = stripComments(read(file));
    expect(body).toContain(workflowId);
  });

  it('gives every generation module a DISTINCT workflow id', () => {
    const ids = GENERATION_MODULES.map((m) => m.workflowId);
    // Two modules sharing an id would merge two cost figures into one and make neither
    // recoverable, which is the failure this whole change exists to end.
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(GENERATION_MODULES)('$file reaches the instrument lazily, not at module load', ({ file }) => {
    // Load-bearing, and a real regression once already. `openaiInstrumented` imports
    // aiEventService, which calls Model.init at module load. A STATIC import therefore drags a
    // live Sequelize model into the graph of every module that transitively reaches these
    // files, and factoryDecomposeRun's test says in its own header that it mocks no DB because
    // it needs none. Adding the static import broke it. Requiring inside the factory keeps the
    // graph clean and costs nothing, since the client is memoised on first real call.
    const body = stripComments(read(file));
    expect(body).not.toMatch(/^\s*import\s+\{[^}]*getInstrumentedOpenAI/m);
    expect(body).toMatch(/require\(['"][^'"]*openaiInstrumented['"]\)/);
  });

  it('keeps the shared json helper labelled by its caller, not by a blanket id', () => {
    // requirementExtraction is the one caller that passes its own id into the shared helper.
    // If it ever stops, its spend silently merges into the generic sbp_model_json bucket.
    const body = stripComments(read('sbp/requirementExtraction.ts'));
    expect(body).toContain("defaultClient('sbp_requirement_extract')");
  });
});

describe('the instrumented factory still records what the cost report reads', () => {
  it('emits model, tokens, cost and duration', () => {
    const body = read('openaiInstrumented.ts');
    for (const field of ['cost_usd', 'duration_ms', 'total_tokens', 'model']) {
      expect(body).toContain(field);
    }
  });
});
