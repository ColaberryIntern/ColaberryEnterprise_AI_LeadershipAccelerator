/**
 * govSourceBundleStore — persist the private solicitation-ZIP evidence of record, and (later) hand it back.
 *
 * Idempotent by content hash within a (tenant, qualification) scope: re-attesting the same ZIP must not produce
 * two rows and two files on the volume. The unique index on (tenant_id, qualification_key, sha256) is the
 * backstop; the lookup below is the fast path, and the catch-and-refetch handles the race where two concurrent
 * attestations of the same bytes both miss it. Mirrors attachmentStore.ts, scoped to a gov qualification.
 *
 * Bytes are written to the persistent uploads volume (file first, then the row) — a file with no row is
 * recoverable orphaned bytes; a row with no file is a bundle the workspace reports as missing.
 */
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import GovSourceBundle from '../../../models/GovSourceBundle';
import { GOV_SOURCE_BUNDLE_DIR } from '../../../config/upload';

export interface StoredSourceBundle {
  id: string;
  filename: string;
  mime: string;
  byte_size: number;
  sha256: string;
  /** True when these bytes were already on file for this (tenant, qualification) — no new write. */
  deduped: boolean;
}

export interface UploadedBundle {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size?: number;
}

/** Strip any path components a client may have sent and cap the length (prod is Linux; split both separators). */
function safeDisplayName(name: string): string {
  const base = String(name || '')
    .split(/[\\/]/).pop()!
    .replace(/[\r\n\t]/g, '')
    .trim();
  return (base || 'solicitation.zip').slice(0, 255);
}

/**
 * Store the solicitation ZIP for a (tenant, qualification), or return the existing bundle when the same bytes
 * are already on file for it. Idempotent and race-safe.
 */
export async function storeGovSourceBundle(
  tenantId: string,
  qualificationKey: string,
  file: UploadedBundle,
): Promise<StoredSourceBundle> {
  const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
  const where = { tenant_id: tenantId, qualification_key: qualificationKey, sha256 };

  const existing = await GovSourceBundle.findOne({ where });
  if (existing) {
    return { id: existing.id, filename: existing.filename, mime: existing.mime, byte_size: existing.byte_size, sha256, deduped: true };
  }

  const ext = path.extname(file.originalname || '').toLowerCase() || '.zip';
  const storedName = `${crypto.randomUUID()}${ext}`;
  const filename = safeDisplayName(file.originalname);
  const byteSize = file.size ?? file.buffer.length;

  await fs.mkdir(GOV_SOURCE_BUNDLE_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(path.join(GOV_SOURCE_BUNDLE_DIR, storedName), file.buffer);

  try {
    const row = await GovSourceBundle.create({
      tenant_id: tenantId,
      qualification_key: qualificationKey,
      sha256,
      mime: file.mimetype || 'application/zip',
      byte_size: byteSize,
      filename,
      stored_name: storedName,
    });
    return { id: row.id, filename: row.filename, mime: row.mime, byte_size: row.byte_size, sha256, deduped: false };
  } catch (err: any) {
    // Lost a race against a concurrent attestation of the same bytes — the unique index rejected us. The
    // winner's row is the answer; drop our now-orphaned duplicate file rather than leaving it on the volume.
    const winner = await GovSourceBundle.findOne({ where });
    if (winner) {
      await fs.unlink(path.join(GOV_SOURCE_BUNDLE_DIR, storedName)).catch(() => {});
      return { id: winner.id, filename: winner.filename, mime: winner.mime, byte_size: winner.byte_size, sha256, deduped: true };
    }
    throw err;
  }
}
