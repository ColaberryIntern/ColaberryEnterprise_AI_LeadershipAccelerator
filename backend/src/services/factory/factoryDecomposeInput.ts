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
import { isExplicitlyNonBinding } from './proposal/requirementTriage';
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
  /**
   * The stored triage verdict, if any. A row explicitly judged NON-BINDING becomes a `context`
   * block instead of a `requirement` block, which removes the SOURCE_COVERAGE obligation
   * without discarding the text.
   */
  interpretation?: string | null;
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
  // DEMOTE, DO NOT DROP. A row that obliges us to nothing should not force a task to cite it,
  // but its text is often the most useful content in the set - the Herriman Q&A rows carry the
  // integration directions ("GIS and Bluestakes two-way, LAMA and SpryPoint one way") that no
  // requirement states. Dropping them would trade one defect for an information loss, so a
  // non-binding row becomes a `context` block: still in the prompt, no longer citable.
  //
  // SOURCE_COVERAGE keys on `kind === 'requirement'` (see factoryDecomposePrompt's
  // coversRequirementBlocks), so the demotion is exactly what lifts the obligation.
  //
  // UNTRIAGED ROWS STAY REQUIREMENTS. `isExplicitlyNonBinding` is false for a row with no
  // verdict, so a project that has never been triaged keeps every coverage obligation it had.
  // The alternative - treating "no verdict" as "not binding" - would make the gate pass by
  // asking for nothing.
  const reqBlocks: SourceBlock[] = src.requirements.map((r): SourceBlock => ({
    id: `blk-${r.id}`,
    locator: r.section ?? r.id,
    text: (r.extracted_text && r.extracted_text.trim()) || r.statement,
    kind: isExplicitlyNonBinding(r.interpretation) ? 'context' : 'requirement',
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
    // THE OTHER HALF OF THE DEMOTION. Demoting the BLOCK lifted the citation obligation, but
    // this list is rendered to the model under a heading that literally reads REQUIREMENTS, so
    // "All Proposals received will be reviewed by a Review Panel" still arrived labelled as
    // something to satisfy - and the model duly built a task for it. Measured: after demoting
    // blocks alone, the Herriman decomposition still produced Evaluate Proposal, Select Vendor,
    // Negotiate Contract and Finalize Contract, all of them the City's job.
    //
    // Nothing is lost by excluding them here: the same text is still in sourceBlocks as a
    // `context` block, so the model reads it as information rather than as an obligation.
    requirements: src.requirements
      .filter((r) => !isExplicitlyNonBinding(r.interpretation))
      .map((r) => ({
        id: r.id, statement: r.statement, kind: r.kind, priority: r.priority, section: r.section,
      })),
    context: derivedContext,
  };

  return { blocks, promptInputs };
}
