/**
 * factoryDecomposeInput — PURE adapter from already-loaded contract records to the decomposer's
 * grounded input. No I/O, no DB: the caller loads the ProjectUnderstanding + ContractRequirements
 * and hands them in; this turns them into (a) the classified SourceBlocks the tasks cite and that
 * factoryAssemble (T5) attaches to the project, and (b) the FactoryDecomposeInputs the prompt (T2)
 * and service (T4) consume.
 *
 * The deterministic guarantees this establishes UPSTREAM of the LLM:
 *  - SOURCE_CLASSIFICATION: every block is 'requirement' or 'context' — never 'unresolved'.
 *  - SOURCE_COVERAGE is satisfiable: every requirement becomes exactly one 'requirement' block with
 *    a stable, readable id the model is told to cite.
 *  - Idempotency: the same input yields byte-identical blocks and ids (ids are derived from the
 *    stable requirement id / dimension name, not minted fresh).
 *
 * Single responsibility: this produces the decompose INPUT only. The caller/orchestrator passes the
 * full ContractRequirement/ContractTrack records to factoryAssemble directly; they are not re-derived here.
 */
import type { SourceBlock } from './contracts/factoryContract';
import type { FactoryDecomposeInputs } from './factoryDecomposePrompt';

/** The requirement fields the adapter needs (a subset of ContractRequirement). */
export interface FactoryDecomposeRequirementInput {
  id: string;
  statement: string;
  kind: string;
  priority: string;
  section?: string;
  /** the verbatim source text, preferred over the paraphrased statement for the citable block. */
  extracted_text?: string;
}

/** One understanding dimension (a projection of ProjectUnderstanding.items). */
export interface FactoryUnderstandingItem {
  dimension: string;
  content: string;
}

export interface FactoryDecomposeSource {
  requirements: FactoryDecomposeRequirementInput[];
  understanding?: FactoryUnderstandingItem[];
  /** optional free-text project summary for the prompt's CONTEXT; derived from understanding if absent. */
  contextSummary?: string;
}

export interface PreparedFactoryDecompose {
  /** classified source blocks (none 'unresolved'); cited by tasks and attached to the project (T5). */
  blocks: SourceBlock[];
  /** the input the decompose prompt/service consume. */
  promptInputs: FactoryDecomposeInputs;
}

/** Stable, readable slug for a dimension name, so a context block id is deterministic. */
const slug = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'x';

/** Keep the first block per id so a duplicate requirement id / colliding slug cannot double a block. */
function dedupeById(blocks: SourceBlock[]): SourceBlock[] {
  const seen = new Set<string>();
  const out: SourceBlock[] = [];
  for (const b of blocks) {
    if (seen.has(b.id)) continue;
    seen.add(b.id);
    out.push(b);
  }
  return out;
}

export function buildFactoryDecomposeInput(src: FactoryDecomposeSource): PreparedFactoryDecompose {
  const reqBlocks: SourceBlock[] = src.requirements.map((r): SourceBlock => ({
    id: `blk-${r.id}`,
    locator: r.section ?? r.id,
    text: (r.extracted_text && r.extracted_text.trim()) || r.statement,
    kind: 'requirement',
  }));

  const ctxBlocks: SourceBlock[] = (src.understanding ?? [])
    .filter((u) => u.content && u.content.trim())
    .map((u): SourceBlock => ({
      id: `ctx-${slug(u.dimension)}`,
      locator: u.dimension,
      text: u.content,
      kind: 'context',
    }));

  const blocks = dedupeById([...reqBlocks, ...ctxBlocks]);

  const derivedContext =
    src.contextSummary ??
    ((src.understanding ?? [])
      .filter((u) => u.content && u.content.trim())
      .map((u) => `${u.dimension}: ${u.content}`)
      .join('\n') || undefined);

  const promptInputs: FactoryDecomposeInputs = {
    sourceBlocks: blocks.map((b) => ({ id: b.id, locator: b.locator, text: b.text, kind: b.kind })),
    requirements: src.requirements.map((r) => ({
      id: r.id, statement: r.statement, kind: r.kind, priority: r.priority, section: r.section,
    })),
    context: derivedContext,
  };

  return { blocks, promptInputs };
}
