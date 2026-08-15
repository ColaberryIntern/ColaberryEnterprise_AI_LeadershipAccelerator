/**
 * read_attachments — the tool that lets an agent SEE what a student handed it.
 *
 * Takes attachment ids, returns image content parts to append to the user turn.
 * Every failure is soft and named: an unreadable file becomes a `skipped` entry
 * the agent can talk about ("that PDF wouldn't open — send a PNG?"), never a
 * thrown error that costs the student their whole message.
 *
 * The tool never decides WHETHER an agent may use it — call sites ask
 * agentToolRegistry.agentHasTool() first. Keeping the grant check outside means
 * a surface that forgets to check is visible in review as a missing call, not
 * hidden inside a helper that silently returns nothing.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import AgentAttachment from '../../../models/AgentAttachment';
import { AGENT_ATTACHMENT_DIR } from '../../../config/upload';
import { normalizeImageForVision, rasterizePdfFirstPage } from './imageNormalizer';
import type { AttachmentRef, ContentPart, ReadAttachmentsResult, SkippedAttachment } from './types';

/**
 * Images per turn. Four is a deliberate ceiling, not a placeholder: vision
 * tokens dominate the cost of a coaching turn, and a student who needs to show
 * more than four screenshots at once has a different problem than a mentor
 * message can solve.
 */
export const MAX_ATTACHMENTS_PER_TURN = 4;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function skip(id: string, name: string | null, reason: SkippedAttachment['reason'], detail: string): SkippedAttachment {
  return { id, name, reason, detail };
}

/** sha256 of a buffer, hex — the idempotency key for an upload. */
export function hashBytes(buf: Buffer): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Resolve one stored attachment to a vision-ready data URL.
 * Returns null when the bytes cannot be turned into an image at all.
 */
async function toDataUrl(mime: string, storedName: string): Promise<string | null> {
  // basename() guards against a stored_name that somehow contains a path.
  const filePath = path.join(AGENT_ATTACHMENT_DIR, path.basename(storedName));
  let buf: Buffer;
  try {
    buf = await fs.readFile(filePath);
  } catch {
    return null; // row exists but the file is gone (volume reset, manual delete)
  }

  if (mime === 'application/pdf') {
    // A PDF's content is a visual template with little or no text layer, so it
    // is rendered and read as an image — see imageNormalizer's header.
    const page = await rasterizePdfFirstPage(buf);
    if (!page) return null;
    try {
      return (await normalizeImageForVision(page)).dataUrl;
    } catch {
      return null;
    }
  }

  try {
    return (await normalizeImageForVision(buf)).dataUrl;
  } catch {
    return null;
  }
}

/**
 * Read the attachments a student referenced on this turn.
 *
 * @param enrollmentId the OWNER the refs are checked against. An id belonging
 *   to another student resolves to 'not_found' — identical to a nonexistent id,
 *   so probing for other students' attachments tells you nothing.
 */
export async function readAttachments(
  enrollmentId: string,
  refs: AttachmentRef[],
): Promise<ReadAttachmentsResult> {
  const parts: ContentPart[] = [];
  const skipped: SkippedAttachment[] = [];
  if (!Array.isArray(refs) || refs.length === 0) return { parts, skipped, attached: 0 };

  // Anything past the ceiling is reported, never silently dropped — a student
  // who attached six images and heard about four would think the mentor
  // ignored two of them.
  const accepted = refs.slice(0, MAX_ATTACHMENTS_PER_TURN);
  for (const extra of refs.slice(MAX_ATTACHMENTS_PER_TURN)) {
    skipped.push(skip(
      extra.id, extra.name ?? null, 'over_limit',
      `Only ${MAX_ATTACHMENTS_PER_TURN} files can be read at once — this one was not included.`,
    ));
  }

  for (const ref of accepted) {
    const name = ref.name ?? null;
    // A malformed id would reach the uuid column and make Postgres throw
    // `invalid input syntax for type uuid`, turning a bad reference into a 500.
    // Same guard, same reason as projectMentorService's story-id fallback.
    if (!ref.id || !UUID_RE.test(ref.id)) {
      skipped.push(skip(String(ref.id || ''), name, 'not_found', 'That file reference is not valid.'));
      continue;
    }

    const row = await AgentAttachment.findOne({ where: { id: ref.id, enrollment_id: enrollmentId } });
    if (!row) {
      skipped.push(skip(ref.id, name, 'not_found', 'That file could not be found.'));
      continue;
    }

    const dataUrl = await toDataUrl(row.mime, row.stored_name);
    if (!dataUrl) {
      skipped.push(skip(
        ref.id, name || row.filename, 'unreadable',
        'That file could not be opened as an image — try a PNG or JPG screenshot.',
      ));
      continue;
    }

    // The filename precedes its image so the model can refer to the right one
    // when several are attached ("the error in setup.png", not "the second image").
    parts.push({ type: 'text', text: `[attached file: ${row.filename}]` });
    parts.push({ type: 'image_url', image_url: { url: dataUrl } });
  }

  return { parts, skipped, attached: parts.filter((p) => p.type === 'image_url').length };
}

/**
 * A one-line instruction telling the agent what it is looking at, and what to
 * say about anything that did not come through. Appended to the system prompt
 * so it is framing, not something the student appears to have typed.
 */
export function attachmentInstruction(result: ReadAttachmentsResult): string {
  if (!result.attached && !result.skipped.length) return '';
  const lines: string[] = [];
  if (result.attached) {
    lines.push(
      `The student attached ${result.attached} file${result.attached === 1 ? '' : 's'} to this message — ` +
      'they are included above as images. Look at them and respond to what you actually see: quote the ' +
      'error text, name the button, describe the layout. Never say you cannot see images.',
    );
  }
  if (result.skipped.length) {
    lines.push(
      `Tell the student plainly that ${result.skipped.length} file${result.skipped.length === 1 ? '' : 's'} ` +
      `could not be read: ${result.skipped.map((s) => `"${s.name || s.id}" — ${s.detail}`).join(' ')}`,
    );
  }
  return lines.join(' ');
}
