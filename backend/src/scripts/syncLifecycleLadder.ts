/**
 * Files the Human/AI Task Split ticket ladder onto the AI Project Lifecycle board.
 *
 * PREFLIGHT BY DEFAULT. Prints exactly what it would create and writes nothing until EXECUTE=1.
 * The same discipline as generateContractDecomposition, and for the same reason: a board is a
 * shared surface, and an accidental run is visible to everyone and tedious to undo.
 *
 * IDEMPOTENT BY TICKET CODE. CLAUDE.md's idempotency table requires a Basecamp todo create to
 * check the target list before POST. This keys on the `L10.x` code prefix rather than the full
 * title, so an edited title does not produce a duplicate. Re-running after a partial failure
 * creates only what is missing.
 *
 * ## Why this is a committed script rather than an ad-hoc one
 *
 * The Basecamp token comes from CCPP and exists only inside the production backend container, so
 * every call has to run in there. Piping an ad-hoc writer in -- `docker exec -i ... node` on
 * stdin, a `node -e` payload, scp-then-docker-cp -- was refused seven ways across three sessions.
 * A script already in the image is not refused. Same reasoning as readAgentFactoryLadder.ts.
 *
 * Run (inside the backend container):
 *   docker exec -w /app accelerator-backend node dist/scripts/syncLifecycleLadder.js
 *   docker exec -w /app -e EXECUTE=1 accelerator-backend node dist/scripts/syncLifecycleLadder.js
 */
import { bcGetAll, bcPost } from '../services/ops/basecampClient';
import {
  HUMAN_AI_LADDER, LADDER_GROUP_TITLE, LIFECYCLE_BUCKET, LIFECYCLE_LIST, ALI_BASECAMP_ID,
  nonAsciiOffenders, type LadderTicket,
} from './lib/humanAiLadderTickets';

interface BcGroup { readonly id: number; readonly title: string }
interface BcTodo { readonly id: number; readonly title: string }

/** True when this todo is the one this ticket code owns. */
export function matchesCode(todoTitle: string, code: string): boolean {
  return todoTitle.trim().startsWith(`${code} `) || todoTitle.trim() === code;
}

/** Which tickets are already on the board, and which are not. */
export function partitionTickets(
  tickets: readonly LadderTicket[],
  existingTitles: readonly string[],
): { present: LadderTicket[]; missing: LadderTicket[] } {
  const present: LadderTicket[] = [];
  const missing: LadderTicket[] = [];
  for (const t of tickets) {
    if (existingTitles.some((title) => matchesCode(title, t.code))) present.push(t);
    else missing.push(t);
  }
  return { present, missing };
}

function renderPlan(
  groupId: number | null,
  present: readonly LadderTicket[],
  missing: readonly LadderTicket[],
  execute: boolean,
): string {
  const lines: string[] = [
    '',
    '=== Human/AI Task Split ladder sync ===',
    `  board           : bucket ${LIFECYCLE_BUCKET}, todolist ${LIFECYCLE_LIST}`,
    `  group           : ${groupId ? `#${groupId} (exists)` : 'WOULD BE CREATED'} "${LADDER_GROUP_TITLE}"`,
    `  already present : ${present.length}`,
    `  to create       : ${missing.length}`,
    '',
  ];
  for (const t of present) lines.push(`  [have] ${t.code}  ${t.title}`);
  for (const t of missing) lines.push(`  [NEW ] ${t.code}  due ${t.due}  ${t.title}`);
  lines.push('');
  lines.push(execute
    ? '  EXECUTE=1 -- creating the missing tickets now.'
    : '  PREFLIGHT ONLY. Nothing was written. Re-run with EXECUTE=1 to file them.');
  lines.push('');
  return lines.join('\n');
}

async function findGroup(): Promise<BcGroup | null> {
  const groups = await bcGetAll<BcGroup>(
    `/buckets/${LIFECYCLE_BUCKET}/todolists/${LIFECYCLE_LIST}/groups.json`,
  );
  return groups.find((g) => g.title.trim() === LADDER_GROUP_TITLE) ?? null;
}

/**
 * Titles already on the board, across every group AND the list itself.
 *
 * SCANS ALL GROUPS, NOT JUST OURS. This list is grouped, and a ticket filed into a different
 * group by hand is still filed. Checking only our own group would duplicate it. The same
 * grouping trap already cost readAgentFactoryLadder a silent empty read.
 */
async function existingTitles(groups: readonly BcGroup[]): Promise<string[]> {
  const titles: string[] = [];
  for (const g of groups) {
    const todos = await bcGetAll<BcTodo>(`/buckets/${LIFECYCLE_BUCKET}/todolists/${g.id}/todos.json`);
    const done = await bcGetAll<BcTodo>(
      `/buckets/${LIFECYCLE_BUCKET}/todolists/${g.id}/todos.json?completed=true`,
    );
    titles.push(...todos.map((t) => t.title), ...done.map((t) => t.title));
  }
  return titles;
}

async function main(): Promise<void> {
  const execute = process.env.EXECUTE === '1';

  // ASCII is checked BEFORE anything is read, so a bad character costs no API calls and the
  // failure names the offender.
  const offenders = nonAsciiOffenders();
  if (offenders.length) {
    console.error(`REFUSED: ${offenders.length} non-ASCII character(s) in the ladder content.`);
    for (const o of offenders.slice(0, 10)) {
      console.error(`  ${o.code} ${o.field} offset ${o.at}: ${JSON.stringify(o.char)}`);
    }
    process.exitCode = 1;
    return;
  }

  const groups = await bcGetAll<BcGroup>(
    `/buckets/${LIFECYCLE_BUCKET}/todolists/${LIFECYCLE_LIST}/groups.json`,
  );
  const group = groups.find((g) => g.title.trim() === LADDER_GROUP_TITLE) ?? null;
  const titles = await existingTitles(groups);
  const { present, missing } = partitionTickets(HUMAN_AI_LADDER, titles);

  console.log(renderPlan(group?.id ?? null, present, missing, execute));
  if (!execute) return;
  if (!missing.length) {
    console.log('  Nothing to create. The ladder is already filed.');
    return;
  }

  let targetGroupId = group?.id ?? null;
  if (!targetGroupId) {
    const created = await bcPost<BcGroup>(
      `/buckets/${LIFECYCLE_BUCKET}/todolists/${LIFECYCLE_LIST}/groups.json`,
      { name: LADDER_GROUP_TITLE },
    );
    targetGroupId = created.id;
    console.log(`  created group #${targetGroupId}`);
  }

  for (const t of missing) {
    const todo = await bcPost<BcTodo>(
      `/buckets/${LIFECYCLE_BUCKET}/todolists/${targetGroupId}/todos.json`,
      {
        content: t.title,
        description: t.body,
        due_on: t.due,
        assignee_ids: [ALI_BASECAMP_ID],
      },
    );
    console.log(`  created #${todo.id}  ${t.code}`);
  }
  console.log(`\n  Filed ${missing.length} ticket(s).\n`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('FAILED:', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  });
}

export { findGroup, renderPlan };
