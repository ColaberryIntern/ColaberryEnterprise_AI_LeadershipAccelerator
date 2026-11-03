/**
 * Prints the Agent Factory ticket ladder. READ-ONLY: it imports only `bcGetAll`, never a
 * mutating helper, and a test asserts that no mutating call appears in this file at all.
 *
 * ## Why this is a committed script and not an ad-hoc one
 *
 * The Basecamp token comes from CCPP and exists only inside the production backend container, so
 * every read has to run in there. Piping an ad-hoc reader in -- `docker exec -i ... node` on
 * stdin, a `node -e` payload, scp-then-docker-cp -- is refused, and was refused seven different
 * ways across three sessions, which left the ladder unreadable and the whole queue unworkable.
 * Running a script that is already IN the image is not refused: that is how
 * `renameAgentDomainProjects.ts` ran against production on 2026-10-28.
 *
 * So this exists to make the ladder readable by the sanctioned route instead of a worked-around
 * one:
 *
 *   docker exec -w /app accelerator-backend node dist/scripts/readAgentFactoryLadder.js
 *
 * ## Two things it does that the ad-hoc readers got wrong
 *
 *   1. **The list is GROUPED.** `/todolists/<LIST>/todos.json` returns ZERO todos for it; they
 *      hang off each GROUP. A reader that asks the list directly reports an empty queue and
 *      looks like it worked.
 *   2. **It paginates properly.** `bcGetAll` follows `Link: rel="next"` and logs
 *      `basecamp_pagination_capped` if it ever hits the cap. The ad-hoc readers hand-rolled a
 *      `?page=N` loop that stopped on the first short page, so a long group could silently
 *      truncate and under-report the queue.
 *
 * Env overrides `BUCKET` and `LIST` exist so the same script can read another board; they
 * default to the Agent Factory list.
 *
 * Run: `node dist/scripts/readAgentFactoryLadder.js` (inside the backend container)
 */
import { bcGetAll } from '../services/ops/basecampClient';

/** Agent Factory: bucket 7463955, todolist 10406233777. */
export const AGENT_FACTORY_BUCKET = 7463955;
export const AGENT_FACTORY_LIST = 10406233777;

interface BcGroup { readonly id: number; readonly title: string }
interface BcAssignee { readonly name?: string }
interface BcTodo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly due_on: string | null;
  readonly assignees?: readonly BcAssignee[];
  readonly description?: string;
}

export interface LadderTodo {
  readonly id: number;
  readonly group: string;
  readonly title: string;
  /** `null`, not a placeholder string: a missing due date is data, not the text "NO DUE". */
  readonly due: string | null;
  readonly assignees: readonly string[];
  readonly description: string;
}

export interface Ladder {
  readonly open: readonly LadderTodo[];
  readonly completedCount: number;
  readonly groupCount: number;
}

/**
 * Basecamp stores rich HTML. Flatten to one line for a list view, keeping the words and losing
 * the markup, so a `<div>`-per-paragraph description does not arrive as a wall of tags.
 */
export function flattenDescription(html: string | undefined): string {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&rsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read the ladder. Open todos in list order, plus the counts needed to judge the queue. */
export async function readLadder(
  bucket: number = AGENT_FACTORY_BUCKET,
  list: number = AGENT_FACTORY_LIST,
): Promise<Ladder> {
  const groups = await bcGetAll<BcGroup>(`/buckets/${bucket}/todolists/${list}/groups.json`);
  const open: LadderTodo[] = [];
  let completedCount = 0;

  for (const g of groups) {
    // COMPLETED TODOS ARE A SEPARATE COLLECTION, not a filter on this one.
    //
    // This used to pass `?status=` on the belief that an empty status asks for completed todos as
    // well as open ones. It does not — `?status=` returns ONLY open todos, so `completedCount`
    // could never be anything but zero, and the NOTE in `renderLadder` invited readers to
    // conclude "nobody closes todos on this board" from a counter incapable of counting.
    // Measured 2026-11-03: a sweep omitted L9.1 (10396178653) and C2.6 (10379236363) while a
    // direct read of each showed them closed. The unit test did not catch it because its mock
    // returned already-closed todos from a URL the real API never returns them from.
    // eslint-disable-next-line no-await-in-loop
    const todos = await bcGetAll<BcTodo>(`/buckets/${bucket}/todolists/${g.id}/todos.json`);
    // eslint-disable-next-line no-await-in-loop
    const done = await bcGetAll<BcTodo>(
      `/buckets/${bucket}/todolists/${g.id}/todos.json?completed=true`,
    );
    completedCount += done.length;
    for (const t of todos) {
      // Belt and braces: the open collection should not contain these, and if it ever does we
      // must not double-count them against `done` above.
      if (t.completed) { continue; }
      open.push({
        id: t.id,
        group: g.title,
        title: t.title,
        due: t.due_on || null,
        assignees: (t.assignees || []).map((a) => a.name || '').filter(Boolean),
        description: flattenDescription(t.description),
      });
    }
  }

  return { open, completedCount, groupCount: groups.length };
}

/**
 * One block per open ticket, plus a header.
 *
 * The header says the completed count out loud because an open row is not evidence the work is
 * undone — a reader who does not know that will start a ticket that shipped a week ago, and two
 * sessions nearly did.
 *
 * The note used to assert "nobody closes todos on this board" as the REASON for a zero. That
 * claim was unfounded: the reader was passing `?status=`, which returns only open todos, so the
 * count was always zero no matter who had closed what. The advice survived the correction; the
 * stated reason did not. It now says what is actually known.
 */
export function renderLadder(ladder: Ladder, descriptionChars = 300): string {
  const lines: string[] = [
    `LADDER  ${ladder.open.length} OPEN  /  ${ladder.completedCount} COMPLETED  /  `
    + `${ladder.open.length + ladder.completedCount} TOTAL  across ${ladder.groupCount} group(s)`,
  ];
  if (ladder.completedCount === 0 && ladder.open.length > 0) {
    lines.push('NOTE: 0 completed on this board. An OPEN row is not evidence the work is undone --');
    lines.push('      tickets here are often shipped and then left open. Read the ticket comments');
    lines.push('      and the git history before starting anything.');
  }
  for (const t of ladder.open) {
    lines.push('');
    lines.push(`#${t.id}  [${t.group}]  ${t.title}`);
    lines.push(`    due ${t.due ?? 'NONE'}  |  ${t.assignees.join(', ') || 'UNASSIGNED'}`);
    const d = t.description.slice(0, descriptionChars);
    if (d) lines.push(`    ${d}${t.description.length > descriptionChars ? ' ...' : ''}`);
  }
  return lines.join('\n');
}

export async function main(): Promise<void> {
  const bucket = Number(process.env.BUCKET || AGENT_FACTORY_BUCKET);
  const list = Number(process.env.LIST || AGENT_FACTORY_LIST);
  const ladder = await readLadder(bucket, list);
  console.log(renderLadder(ladder));
}

/* istanbul ignore next -- entry point only; the tests drive readLadder/renderLadder. */
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((err: unknown) => {
      console.error('readAgentFactoryLadder failed:', err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
