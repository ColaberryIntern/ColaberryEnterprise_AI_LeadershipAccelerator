/**
 * Counts the PDF artifacts attached to Basecamp tickets. READ-ONLY.
 *
 * ## Why this exists when readBasecampTicket.ts already reads tickets
 *
 * `readBasecampTicket.ts` renders comments through `htmlToText`, whose `.replace(/<[^>]*>/g, '')`
 * strips the `<bc-attachment>` element entirely — and the filename lives in that element's
 * ATTRIBUTES, not in its text. So grepping its output for `.pdf` returns nothing on a ticket that
 * demonstrably has two PDFs. Measured 2026-11-03 against C2.6 (`todos/10379236363`), the reference
 * two-PDF ticket: zero hits. That reader cannot answer this question, and a zero from it is not
 * evidence of absence.
 *
 * ## The control is not optional, and this script enforces that
 *
 * The whole point of this tool is to justify CLOSING tickets, so a false zero has a real cost: it
 * reports "no artifacts" for a ticket that has them, and the work gets redone. Equally, a broken
 * detector reporting zero everywhere would look like a clean, decisive answer.
 *
 * So every run first audits a CONTROL ticket known to carry two PDFs. **If the control does not
 * come back with at least two, the script refuses to report any other result at all.** A check
 * that cannot demonstrate it detects the positive case is not allowed to publish negatives here.
 *
 *   docker exec -w /app -e LIST=10396175294 -e BUCKET=7463955 \
 *     accelerator-backend node dist/scripts/auditTicketArtifacts.js
 *
 * ## Env
 *
 *   BUCKET   project id. Default 7463955 (Ali Personal).
 *   LIST     todolist id to sweep. Mutually exclusive with TICKETS.
 *   TICKETS  comma-separated todo ids, instead of a whole list.
 *   CONTROL  the known-two-PDF ticket. Default 10379236363 (C2.6). Set to "0" to skip ONLY if you
 *            genuinely do not care whether the detector works.
 *   RAW      "1" to dump each raw <bc-attachment ...> tag found, for when the shape surprises us.
 */
import { bcGet, bcGetAll } from '../services/ops/basecampClient';

export const DEFAULT_BUCKET = 7463955;
/** C2.6 — Objection and Risk Register. The reference two-PDF ticket Ali points at. */
export const DEFAULT_CONTROL_TICKET = 10379236363;

interface BcGroup { readonly id: number; readonly title: string }
interface BcTodo {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly due_on: string | null;
  readonly comments_count?: number;
}
interface BcComment { readonly id: number; readonly content?: string; readonly created_at: string }

export interface AttachmentScan {
  /** How many <bc-attachment> elements appeared. */
  readonly attachments: number;
  /** Distinct filenames ending .pdf, however they were spelled in the markup. */
  readonly pdfNames: readonly string[];
  /** Distinct content-type attribute values seen. */
  readonly contentTypes: readonly string[];
  /**
   * How many attachments declared a PDF content type.
   *
   * Counted separately from `contentTypes` because that set is DEDUPLICATED: two PDFs with no
   * exposed filename both collapse to one `application/pdf` entry, so counting the set would
   * report one artifact where there are two — and two is exactly the threshold that decides
   * whether a ticket may be closed.
   */
  readonly pdfTypedAttachments: number;
  /** Raw tags, for diagnosing a shape this parser did not expect. */
  readonly rawTags: readonly string[];
}

/**
 * Scan raw comment HTML for attachments.
 *
 * Deliberately looks for a PDF three independent ways — a `filename`/`caption` attribute, a
 * `content-type` of `application/pdf`, and any `*.pdf` token anywhere in the markup — because the
 * exact attribute set Basecamp returns varies by how the file was uploaded, and a parser keyed on
 * one spelling is a false zero waiting to happen.
 */
export function scanAttachments(htmls: readonly (string | undefined)[]): AttachmentScan {
  const rawTags: string[] = [];
  const pdfNames = new Set<string>();
  const contentTypes = new Set<string>();
  let attachments = 0;
  let pdfTypedAttachments = 0;

  for (const html of htmls) {
    const s = String(html || '');
    for (const m of s.matchAll(/<bc-attachment\b[^>]*>/gi)) {
      attachments += 1;
      rawTags.push(m[0]);
      const ct = /content-type\s*=\s*"([^"]*)"/i.exec(m[0]);
      if (ct) {
        contentTypes.add(ct[1]);
        if (/pdf/i.test(ct[1])) pdfTypedAttachments += 1;
      }
    }
    // Any .pdf token, whether it sat in filename=, caption=, href= or plain text.
    for (const m of s.matchAll(/([A-Za-z0-9_.\-%()]+\.pdf)\b/gi)) {
      pdfNames.add(decodeURIComponent(m[1]));
    }
  }
  return {
    attachments,
    pdfNames: [...pdfNames].sort(),
    contentTypes: [...contentTypes].sort(),
    pdfTypedAttachments,
    rawTags,
  };
}

/**
 * PDFs counted the generous way: whichever of the two independent signals saw more.
 *
 * `max` rather than a preference order, because each signal misses a real case — a PDF linked by
 * href has a name but no attachment tag, and an attachment can declare `application/pdf` while
 * exposing no filename. Taking the larger means a ticket is never under-counted into looking
 * ineligible for closure.
 */
export function pdfCount(scan: AttachmentScan): number {
  return Math.max(scan.pdfNames.length, scan.pdfTypedAttachments);
}

export interface TicketAudit {
  readonly id: number;
  readonly title: string;
  readonly completed: boolean;
  readonly due: string | null;
  readonly commentCount: number;
  readonly scan: AttachmentScan;
  readonly pdfs: number;
}

export async function auditTicket(bucket: number, ticketId: number): Promise<TicketAudit> {
  const todo = await bcGet<BcTodo>(`/buckets/${bucket}/todos/${ticketId}.json`);
  const comments = await bcGetAll<BcComment>(`/buckets/${bucket}/recordings/${ticketId}/comments.json`);
  // The ticket DESCRIPTION can hold attachments too, so it is scanned alongside the comments.
  const scan = scanAttachments([(todo as any).description, ...comments.map((c) => c.content)]);
  return {
    id: todo.id,
    title: todo.title,
    completed: todo.completed,
    due: todo.due_on || null,
    commentCount: comments.length,
    scan,
    pdfs: pdfCount(scan),
  };
}

async function listTicketIds(bucket: number, list: number): Promise<number[]> {
  const groups = await bcGetAll<BcGroup>(`/buckets/${bucket}/todolists/${list}/groups.json`);
  const ids: number[] = [];
  // A grouped list returns ZERO todos when asked directly — they hang off each group. Asking the
  // list is how a reader reports an empty board and looks like it worked.
  for (const g of groups) {
    // eslint-disable-next-line no-await-in-loop
    ids.push(...await listBoth(bucket, g.id));
  }
  if (ids.length === 0) {
    ids.push(...await listBoth(bucket, list));
  }
  // Dedupe: a todo should appear in exactly one collection, but if Basecamp ever returns it in
  // both, auditing it twice would double its PDFs and could push it over the closure threshold.
  return [...new Set(ids)];
}

/**
 * Open AND completed todos of one list or group.
 *
 * Two requests, because completed todos are a SEPARATE collection in Basecamp rather than a
 * filter on the open one. The earlier `?status=` returned only open todos, so a closed ticket was
 * silently missing from the sweep — and a sweep that cannot see a closed ticket reports "still
 * open" for work that was finished and signed off. Measured 2026-11-03: L9.1 (10396178653) and
 * C2.6 (10379236363) were both absent from their sweeps while a direct read showed each
 * `completed=true`.
 */
export async function listBoth(bucket: number, listOrGroup: number): Promise<number[]> {
  const base = `/buckets/${bucket}/todolists/${listOrGroup}/todos.json`;
  const open = await bcGetAll<BcTodo>(base);
  const done = await bcGetAll<BcTodo>(`${base}?completed=true`);
  return [...open, ...done].map((t) => t.id);
}

export function renderAudit(audits: readonly TicketAudit[], raw: boolean): string {
  const lines: string[] = [];
  lines.push(`${'ticket'.padEnd(12)} ${'done'.padEnd(5)} ${'due'.padEnd(11)} ${'cmts'.padEnd(5)} ${'att'.padEnd(4)} pdfs  title`);
  for (const a of audits) {
    lines.push(
      `${String(a.id).padEnd(12)} ${(a.completed ? 'yes' : 'no').padEnd(5)} `
      + `${(a.due ?? '-').padEnd(11)} ${String(a.commentCount).padEnd(5)} `
      + `${String(a.scan.attachments).padEnd(4)} ${String(a.pdfs).padEnd(5)} ${a.title.slice(0, 70)}`,
    );
    if (a.scan.pdfNames.length) lines.push(`             pdfs: ${a.scan.pdfNames.join(', ')}`);
    if (raw) for (const t of a.scan.rawTags) lines.push(`             raw: ${t.slice(0, 200)}`);
  }
  const eligible = audits.filter((a) => a.pdfs >= 2);
  lines.push('');
  lines.push(`${audits.length} ticket(s) audited; ${eligible.length} carry 2+ PDFs.`);
  if (eligible.length) lines.push(`2+ PDFs: ${eligible.map((a) => a.id).join(', ')}`);
  lines.push('NOTE: artifact count only. Whether the WORK is complete is a separate judgement.');
  return lines.join('\n');
}

export async function main(): Promise<void> {
  const bucket = Number(process.env.BUCKET || DEFAULT_BUCKET);
  const control = Number(process.env.CONTROL ?? DEFAULT_CONTROL_TICKET);

  if (control > 0) {
    const c = await auditTicket(bucket, control);
    console.log(
      `CONTROL #${c.id} "${c.title.slice(0, 50)}": ${c.scan.attachments} attachment(s), `
      + `${c.pdfs} pdf(s)${c.scan.pdfNames.length ? ` [${c.scan.pdfNames.join(', ')}]` : ''}`,
    );
    if (c.pdfs < 2) {
      if (process.env.RAW === '1') {
        for (const t of c.scan.rawTags) console.log(`  control raw: ${t.slice(0, 300)}`);
      }
      throw new Error(
        `control ticket ${control} reported ${c.pdfs} PDFs but is known to carry 2. The detector `
        + 'cannot see attachments in this environment, so every zero it would print is worthless. '
        + 'Refusing to report. Re-run with RAW=1 to see the markup it actually got.',
      );
    }
    console.log('control passed: the detector can see PDFs, so a zero below means something.\n');
  } else {
    console.log('CONTROL SKIPPED — a zero below is not evidence of absence.\n');
  }

  const ids = process.env.TICKETS
    ? process.env.TICKETS.split(',').map((s) => Number(s.trim())).filter(Boolean)
    : await listTicketIds(bucket, Number(process.env.LIST));

  const audits: TicketAudit[] = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    audits.push(await auditTicket(bucket, id));
  }
  console.log(renderAudit(audits, process.env.RAW === '1'));
}

/* istanbul ignore next -- entry point only; the tests drive scanAttachments/renderAudit. */
if (require.main === module) {
  main().catch((err) => {
    console.error(`auditTicketArtifacts failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
