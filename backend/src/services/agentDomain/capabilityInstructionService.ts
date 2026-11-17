/**
 * capabilityInstructionService — AF11.14. Record an instruction, read what is in force, read the
 * history. The I/O half; the rules are in `capabilityInstructionContract.ts`.
 *
 * ## APPEND ONLY. There is no UPDATE in this file and that is the design.
 *
 * *"It must be editable later without re-approving the capability, and every edit is recorded with
 * who and when, because it changes agent behaviour in production."* An UPDATE satisfies the first
 * half and destroys the second. So an edit is a new row, the current instruction is the newest
 * row, and the history is everything behind it with its author already attached.
 *
 * ## THE READER IS BATCHED, because the caller has a list of grants
 *
 * The agent dashboard reads every capability an agent holds at once. A per-capability query would
 * be N round trips to render one page, and the obvious fix — reading them all and picking in JS —
 * would pull the entire history of every capability. `loadInstructionsInForce` uses DISTINCT ON,
 * which is the one shape that returns exactly the newest row per capability in a single pass.
 *
 * ## "NEWEST" IS `seq`
 *
 * Not `created_at`. `DEFAULT NOW()` is the transaction timestamp, so two entries written in one
 * transaction tie and `DISTINCT ON` picks arbitrarily between them — measured against
 * `accelerator_dev1`, where it returned the instruction a cleared entry had just replaced.
 */
import { QueryTypes, type Sequelize } from 'sequelize';
import {
  acceptInstruction,
  type AcceptedInstruction,
  type InstructionEntry,
  type InstructionInput,
  type InstructionIssue,
} from './capabilityInstructionContract';

export class InstructionRefusedError extends Error {
  readonly issues: ReadonlyArray<InstructionIssue>;
  constructor(issues: ReadonlyArray<InstructionIssue>) {
    super(`InstructionRefused: ${issues.map((i) => i.rule).join(', ')}`);
    this.name = 'InstructionRefusedError';
    this.issues = issues;
  }
}

/**
 * Record one set of standing instructions.
 *
 * The actor comes from the verified caller, never from the body. Returns the row as stored so the
 * caller echoes what was recorded rather than what was sent, which are different whenever the
 * contract trimmed something.
 */
export async function recordInstruction(
  sequelize: Sequelize,
  input: InstructionInput,
): Promise<InstructionEntry> {
  const verdict = acceptInstruction(input);
  if (!verdict.ok) throw new InstructionRefusedError(verdict.issues);
  const v: AcceptedInstruction = verdict.value;

  const rows = await sequelize.query<InstructionEntry>(
    `INSERT INTO agent_domain_capability_instructions
       (agent_id, capability_id, instructions, set_by_identity)
     VALUES ($1, $2, $3, $4)
     RETURNING instructions, set_by_identity, created_at`,
    {
      bind: [v.agentId, v.capabilityId, v.instructions, v.setByIdentity],
      type: QueryTypes.SELECT,
    },
  );
  const row = rows[0];
  return {
    instructions: row.instructions,
    set_by_identity: row.set_by_identity,
    created_at: String(row.created_at),
  };
}

/** Every entry for one capability on one agent, newest first. The history view. */
export async function loadInstructionHistory(
  sequelize: Sequelize,
  agentId: string,
  capabilityId: string,
): Promise<InstructionEntry[]> {
  const rows = await sequelize.query<InstructionEntry>(
    `SELECT instructions, set_by_identity, created_at
       FROM agent_domain_capability_instructions
      WHERE agent_id = $1 AND capability_id = $2
      ORDER BY seq DESC`,
    { bind: [agentId, capabilityId], type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    instructions: r.instructions,
    set_by_identity: r.set_by_identity,
    created_at: String(r.created_at),
  }));
}

/**
 * What is in force for each of several capabilities on one agent, in one query.
 *
 * Returns a Map keyed by capability id. A capability with NO entry is ABSENT from the map rather
 * than present with a null — the caller has to distinguish "nobody ever set any" from "these were
 * cleared", and an entry whose text is empty is the second of those. Collapsing them would make a
 * removed rule look like one that never existed.
 *
 * An unreadable table returns an EMPTY map rather than throwing, for the same reason the actor
 * roster does: this decorates a grant list, and failing the whole page because the decoration
 * could not be read would be a worse answer than a page without it. The caller says so on screen.
 */
export async function loadInstructionsInForce(
  sequelize: Sequelize,
  agentId: string,
  capabilityIds: ReadonlyArray<string>,
): Promise<Map<string, InstructionEntry>> {
  const ids = [...new Set(capabilityIds.filter((c) => typeof c === 'string' && c.trim()))];
  if (ids.length === 0) return new Map();

  try {
    // DISTINCT ON with a matching ORDER BY is the one shape that returns the newest row per
    // capability in a single pass. IN rather than = ANY: a Sequelize array replacement against
    // ANY() has produced a malformed array literal in this codebase before and crash-looped
    // production, so the array is expanded into named binds instead.
    const binds: Record<string, string> = { agentId };
    const placeholders = ids.map((id, i) => {
      binds[`c${i}`] = id;
      return `$c${i}`;
    }).join(', ');

    const rows = await sequelize.query<InstructionEntry & { capability_id: string }>(
      `SELECT DISTINCT ON (capability_id)
              capability_id, instructions, set_by_identity, created_at
         FROM agent_domain_capability_instructions
        WHERE agent_id = $agentId
          AND capability_id IN (${placeholders})
        ORDER BY capability_id, seq DESC`,
      { bind: binds, type: QueryTypes.SELECT },
    );

    const out = new Map<string, InstructionEntry>();
    for (const r of rows) {
      out.set(r.capability_id, {
        instructions: r.instructions,
        set_by_identity: r.set_by_identity,
        created_at: String(r.created_at),
      });
    }
    return out;
  } catch (err: unknown) {
    console.warn(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event: 'capability_instructions_unreadable',
      outcome: 'partial',
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      context: { message: err instanceof Error ? err.message : String(err) },
    }));
    return new Map();
  }
}
