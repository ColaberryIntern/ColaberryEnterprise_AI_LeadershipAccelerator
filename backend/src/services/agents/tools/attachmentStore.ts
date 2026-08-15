/**
 * attachmentStore — persist what a student hands to an agent, and hand it back.
 *
 * Idempotent by content hash. Dragging the same screenshot in twice, or a
 * browser retrying a flaky upload, must not produce two rows, two files on the
 * volume, and two copies of the same image billed to a vision call. The unique
 * index on (enrollment_id, sha256) is the backstop; the lookup below is the
 * fast path, and the catch-and-refetch handles the race where two concurrent
 * uploads of the same bytes both miss it.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import AgentAttachment from '../../../models/AgentAttachment';
import { AGENT_ATTACHMENT_DIR, AGENT_ATTACHMENT_MIMES } from '../../../config/upload';
import { hashBytes } from './readAttachmentsTool';

export interface StoredAttachment {
  id: string;
  filename: string;
  mime: string;
  byte_size: number;
  /** True when this upload matched bytes already on file (no new write). */
  deduped: boolean;
}

export interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}

/**
 * Strip any path components a client may have sent, and cap the length.
 *
 * Both separators are stripped explicitly rather than via `path.basename`:
 * production is Linux, where basename does NOT treat `\` as a separator, so a
 * Windows client sending `C:\Users\me\secret\shot.png` would have kept the
 * whole string. That name is handed to the model as `[attached file: ...]`, so
 * it would have leaked the student's local directory structure into the prompt.
 * Caught by CI running this suite on Linux after it passed on Windows.
 */
function safeDisplayName(name: string, mime: string): string {
  const base = String(name || '')
    .split(/[\\/]/).pop()!
    .replace(/[\r\n\t]/g, '')
    .trim();
  const fallback = `attachment${AGENT_ATTACHMENT_MIMES[mime] || ''}`;
  return (base || fallback).slice(0, 255);
}

/**
 * Store an uploaded file for `enrollmentId`, or return the existing row when
 * the same bytes are already on file for that student.
 */
export async function storeAttachment(enrollmentId: string, file: UploadedFile): Promise<StoredAttachment> {
  const sha256 = hashBytes(file.buffer);

  const existing = await AgentAttachment.findOne({ where: { enrollment_id: enrollmentId, sha256 } });
  if (existing) {
    return {
      id: existing.id,
      filename: existing.filename,
      mime: existing.mime,
      byte_size: existing.byte_size,
      deduped: true,
    };
  }

  const ext = AGENT_ATTACHMENT_MIMES[file.mimetype] || path.extname(file.originalname || '').toLowerCase() || '';
  const storedName = `${crypto.randomUUID()}${ext}`;
  const filename = safeDisplayName(file.originalname, file.mimetype);
  const byteSize = file.size ?? file.buffer.length;

  // File first, then the row: a file with no row is orphaned bytes on a volume;
  // a row with no file is an attachment the agent reports as unreadable to a
  // student who can plainly see they attached it.
  await fs.mkdir(AGENT_ATTACHMENT_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(AGENT_ATTACHMENT_DIR, storedName), file.buffer);

  try {
    const row = await AgentAttachment.create({
      enrollment_id: enrollmentId,
      sha256,
      mime: file.mimetype,
      byte_size: byteSize,
      filename,
      stored_name: storedName,
    });
    return { id: row.id, filename: row.filename, mime: row.mime, byte_size: row.byte_size, deduped: false };
  } catch (err: any) {
    // Lost a race against a concurrent upload of the same bytes — the unique
    // index rejected us. The winner's row is the answer; drop our now-orphaned
    // duplicate file rather than leaving it on the volume forever.
    const winner = await AgentAttachment.findOne({ where: { enrollment_id: enrollmentId, sha256 } });
    if (winner) {
      await fs.unlink(path.join(AGENT_ATTACHMENT_DIR, storedName)).catch(() => {});
      return {
        id: winner.id, filename: winner.filename, mime: winner.mime,
        byte_size: winner.byte_size, deduped: true,
      };
    }
    throw err;
  }
}

interface ResolvedFile { path: string; mime: string; filename: string }

async function resolve(row: AgentAttachment | null): Promise<ResolvedFile | null> {
  if (!row) return null;
  // basename() guards against a stored_name that somehow contains a path.
  const p = path.join(AGENT_ATTACHMENT_DIR, path.basename(row.stored_name));
  try { await fs.access(p); } catch { return null; }
  return { path: p, mime: row.mime, filename: row.filename };
}

/**
 * Resolve an attachment to a file on disk, scoped to its owner. Null covers
 * "no such id", "not yours", and "file missing" alike — the caller answers 404
 * for all three, so probing tells you nothing.
 */
export async function loadAttachmentFile(
  enrollmentId: string, id: string,
): Promise<ResolvedFile | null> {
  return resolve(await AgentAttachment.findOne({ where: { id, enrollment_id: enrollmentId } }));
}

/**
 * Resolve an attachment WITHOUT an ownership check.
 *
 * Only for callers that have already established the viewer's right to see it —
 * today that is exclusively the signed-URL serve route, where the token was
 * minted after a room-membership check. A DM recipient is not the owner but was
 * genuinely sent the file, so owner-only would have been the wrong rule there;
 * the authorization simply happens at mint time instead of here.
 */
export async function loadAttachmentFileById(id: string): Promise<ResolvedFile | null> {
  return resolve(await AgentAttachment.findByPk(id));
}
