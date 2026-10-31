import { Request, Response } from 'express';
import { z } from 'zod';

import { classifyError } from '../utils/errorClassifier';
import { env } from '../config/env';
import {
  ingestKnowledgeDocument,
  MAX_INGEST_BYTES,
  type IngestResult,
} from '../services/explorerGrowth/explorerKnowledgeIngest';
import { explorerKnowledgeDocumentStore } from '../services/explorerGrowth/explorerKnowledgeDocumentRepository';

/**
 * Uploading a knowledge source.
 *
 * ## Why this has no sub-flag of its own
 *
 * Every other Explorer write is gated by a per-capability flag because it can reach a
 * learner. This one cannot: a stored document lands at `confidence: 'unstated'`, which the
 * quote gate refuses, so nothing uploaded here can appear in a message until a human marks
 * it `grounded` AND `draftRender` is on. A sub-flag would gate nothing that `draftRender`
 * does not already gate downstream, while costing four hand-maintained pins in the flag
 * registry's tests.
 *
 * It is gated on the MASTER `growthOsEnabled`, so the whole Explorer surface still switches
 * off as one unit.
 *
 * ## The response carries no document text
 *
 * Counts and ids only, the same rule the regenerate endpoint follows. An upload response
 * echoing the parsed text would put a copy of the document in every proxy log between here
 * and the browser, for no benefit — the reviewer reads it on the review screen, behind the
 * same guard, one document at a time.
 */

/** Multipart text fields. The file itself arrives on `req.file`. */
export const knowledgeUploadBodySchema = z
  .object({
    /** Defaults to the filename when absent — a reviewer needs something to read. */
    title: z.string().trim().min(1).max(500).optional(),
    brand_id: z.string().uuid().optional(),
  })
  .strict();

/** An uploaded file as multer's memory storage presents it. */
interface UploadedFile {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
}

/** HTTP status for each ingest outcome. */
function statusForResult(result: IngestResult): number {
  if (result.status === 'stored') return 201;
  // A reviewer re-uploading a file they already sent has not done anything wrong, and the
  // end state is exactly what they asked for. That is a 200, not a conflict.
  if (result.status === 'duplicate') return 200;
  // The request was well-formed; the FILE could not be used. 422, not 400 — a 400 reads as
  // "you called this wrong" and sends someone to check their form fields.
  return 422;
}

function logLine(fields: Record<string, unknown>): string {
  return JSON.stringify({ service: 'explorer-knowledge-ingest', ...fields });
}

export async function postKnowledgeDocumentHandler(req: Request, res: Response): Promise<void> {
  // An absent `explorerGrowth` block must read as OFF, never as a TypeError the operator
  // sees as "upload is broken".
  const flags = env.explorerGrowth;
  if (!flags || !flags.growthOsEnabled) {
    console.warn(
      logLine({
        level: 'warn',
        event: 'upload_refused_flag_off',
        outcome: 'failure',
        error_class: 'FeatureDisabled',
      }),
    );
    res.status(403).json({
      error: 'Explorer Growth is switched off.',
      error_class: 'FeatureDisabled',
    });
    return;
  }

  const parsed = knowledgeUploadBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({
      error: 'Validation failed',
      error_class: 'ValidationError',
      details: parsed.error.flatten(),
    });
    return;
  }

  const file = (req as Request & { file?: UploadedFile }).file;
  if (!file?.buffer) {
    res.status(400).json({
      error: 'No file was uploaded. Attach one file in the "document" field.',
      error_class: 'ValidationError',
    });
    return;
  }

  // Fail closed on a missing identity. Behind `requireAdmin` this cannot normally happen,
  // and an ingestion attributed to nobody is a provenance record that answers nothing.
  const actor = req.admin?.email;
  if (!actor) {
    res.status(403).json({
      error: 'No admin identity on the request.',
      error_class: 'AuthError',
    });
    return;
  }

  const sourceRef = file.originalname ?? 'upload';

  try {
    const result = await ingestKnowledgeDocument(
      {
        title: parsed.data.title ?? sourceRef,
        sourceKind: 'upload',
        sourceRef,
        mime: file.mimetype ?? '',
        bytes: file.buffer,
        brandId: parsed.data.brand_id ?? null,
        tenantId: null,
        // The EMAIL, never the uuid: a uuid passes this repo's non-human denylist
        // unconditionally, which makes that guard decorative.
        ingestedBy: actor,
      },
      { store: explorerKnowledgeDocumentStore },
    );

    console.log(
      logLine({
        level: result.status === 'refused' ? 'warn' : 'info',
        event: `upload_${result.status}`,
        outcome: result.status === 'refused' ? 'failure' : 'success',
        source_ref: sourceRef,
        byte_size: file.buffer.length,
        ...(result.status === 'refused'
          ? { error_class: 'IngestRefused', reason: result.reason }
          : { document_id: result.documentId, chunk_count: result.chunkCount }),
      }),
    );

    if (result.status === 'refused') {
      res.status(422).json({
        error: result.detail,
        error_class: 'IngestRefused',
        reason: result.reason,
      });
      return;
    }

    res.status(statusForResult(result)).json({
      status: result.status,
      document_id: result.documentId,
      sha256: result.sha256,
      chunk_count: result.chunkCount,
      ...(result.status === 'stored'
        ? {
            hard_cut_count: result.hardCutCount,
            // Said out loud: a document the reviewer thinks they uploaded whole, that was
            // cut, would otherwise just fail to answer questions about its second half.
            truncated: result.truncated,
            extracted_chars: result.extractedChars,
          }
        : {}),
      // Stated on every success, because "it uploaded" reads as "it is in use".
      quotable: false,
      review_required:
        'Stored. Nothing from this document can be quoted until it is marked grounded.',
    });
  } catch (err) {
    const errorClass = classifyError(err);
    console.error(
      logLine({
        level: 'error',
        event: 'upload_failed',
        outcome: 'failure',
        error_class: errorClass,
        source_ref: sourceRef,
        message: (err as { message?: string })?.message?.slice(0, 200) ?? null,
      }),
    );
    res.status(500).json({
      error: 'The upload failed. Nothing was stored.',
      error_class: errorClass,
    });
  }
}

/** Re-exported so the router and its tests share one number. */
export const KNOWLEDGE_UPLOAD_MAX_BYTES = MAX_INGEST_BYTES;
