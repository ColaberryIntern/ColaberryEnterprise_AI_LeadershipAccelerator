/**
 * One-off backfill: rewrite EXISTING ticket title/description text that still
 * embeds a raw enrollment UUID (the exact defect T004 fixed at the generation
 * source — see reeseAutonomousOutreachService.ts / reeseTicketLinkService.ts) with
 * the student's real name.
 *
 * Usage:
 *   npx ts-node src/scripts/backfillTicketTitlesWithNames.ts             # dry run (default, no writes)
 *   npx ts-node src/scripts/backfillTicketTitlesWithNames.ts --apply     # writes
 *
 * Idempotent by construction: a row is only a "candidate" if its title or
 * description still contains a raw UUID. Once rewritten, it no longer matches,
 * so a re-run (even with --apply) finds it clean and skips it — no double-write,
 * no drift on repeated runs.
 *
 * Rollback: before any write, every candidate's pre-overwrite title/description is
 * written to a JSON undo-log file (one per run, timestamped) — see
 * `writeUndoLog()`. A bad rewrite can be manually reversed from that file without
 * re-deriving names. This closes the loop-plan-auditor's cycle-1 finding
 * (rollback/recovery readiness, dimension 7) against this specific script.
 *
 * Defaults to dry-run rather than apply-by-default (unlike some other backfill
 * scripts in this directory) because this operation rewrites human-facing text
 * on live tickets — a mistake here is visible to Ali directly, not just a stale
 * internal column, so the safer default was chosen deliberately.
 */
import fs from 'fs';
import path from 'path';
import { Ticket } from '../models';
import { resolveStudentDisplayName } from '../services/reese/resolveStudentDisplayName';

export const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export interface BackfillOptions {
  apply: boolean;
}

export const DEFAULTS: BackfillOptions = { apply: false };

export interface BackfillRow {
  ticket_id: string;
  previous_title: string;
  previous_description: string | null;
  new_title: string;
  new_description: string | null;
  resolved_name: string;
  rewritten_at: string;
}

export interface BackfillResult {
  scanned: number;
  matched: number;
  rewritten: number;
  rows: BackfillRow[];
  undoLogPath: string | null;
}

export function parseArgs(argv: string[]): BackfillOptions {
  return { apply: argv.includes('--apply') };
}

/** The first raw UUID found in a title/description string, or null if clean. */
export function extractFirstUuid(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(UUID_PATTERN);
  return match ? match[0] : null;
}

/** Replaces every occurrence of `uuid` in `text` with `name`. Null-safe. */
export function replaceUuidWithName(text: string | null | undefined, uuid: string, name: string): string | null {
  if (text == null) return null;
  return text.split(uuid).join(name);
}

/**
 * Writes the full pre-overwrite snapshot for every row about to be rewritten, as
 * ONE file, BEFORE any of the writes below it run — so every row's undo data is
 * durably on disk before its own (or any other row's) write ever commits.
 */
export function writeUndoLog(rows: BackfillRow[], outDir: string = process.cwd()): string {
  const filePath = path.join(outDir, `backfill-ticket-titles-undo-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
  return filePath;
}

export async function backfillTicketTitlesWithNames(
  options: Partial<BackfillOptions> = {},
): Promise<BackfillResult> {
  const opts: BackfillOptions = { ...DEFAULTS, ...options };
  const tickets = await Ticket.findAll();

  const rows: BackfillRow[] = [];
  for (const ticket of tickets) {
    const uuid = extractFirstUuid(ticket.title) ?? extractFirstUuid(ticket.description);
    if (!uuid) continue; // already clean — idempotency falls out of this check

    const name = await resolveStudentDisplayName(uuid);
    const newTitle = replaceUuidWithName(ticket.title, uuid, name) ?? ticket.title;
    const newDescription = replaceUuidWithName(ticket.description, uuid, name);

    rows.push({
      ticket_id: ticket.id,
      previous_title: ticket.title,
      previous_description: ticket.description ?? null,
      new_title: newTitle,
      new_description: newDescription,
      resolved_name: name,
      rewritten_at: new Date().toISOString(),
    });
  }

  console.log(
    JSON.stringify({
      event: 'backfill_ticket_titles.scanned',
      service: 'backfill',
      scanned: tickets.length,
      matched: rows.length,
      apply: opts.apply,
    }),
  );

  if (!opts.apply || rows.length === 0) {
    return { scanned: tickets.length, matched: rows.length, rewritten: 0, rows, undoLogPath: null };
  }

  // Undo log written BEFORE any write below — every row's pre-overwrite value is
  // durable on disk before its own write (or any other row's) ever commits.
  const undoLogPath = writeUndoLog(rows);

  let rewritten = 0;
  for (const ticket of tickets) {
    const row = rows.find((r) => r.ticket_id === ticket.id);
    if (!row) continue;
    // Ticket.ts's TS attributes declare `description?: string` (not `| null`)
    // even though the DB column is nullable — matching that existing (if loose)
    // model typing rather than widening it as an unrelated change in this task.
    await ticket.update({ title: row.new_title, description: row.new_description ?? undefined });
    rewritten++;
  }

  console.log(
    JSON.stringify({
      event: 'backfill_ticket_titles.done',
      service: 'backfill',
      rewritten,
      undo_log: undoLogPath,
    }),
  );

  return { scanned: tickets.length, matched: rows.length, rewritten, rows, undoLogPath };
}

/* istanbul ignore next — CLI entry point, exercised operationally not in unit tests */
if (require.main === module) {
  backfillTicketTitlesWithNames(parseArgs(process.argv.slice(2)))
    .then((r) => {
      console.log(`[Backfill] scanned=${r.scanned} matched=${r.matched} rewritten=${r.rewritten}`);
      process.exit(0);
    })
    .catch((err: any) => {
      console.error('[Backfill] failed:', err?.message);
      process.exit(1);
    });
}
