import { Request, Response } from 'express';
import { getFlotationPreview } from '../services/delivery/flotationPreviewService';

/**
 * GET /api/flotation/preview/:token
 *
 * The prospect's own read of their own conversation, keyed on the `rawPayloadId` the ingest
 * response already handed their browser. No account, no email, no login - see
 * `flotationPreviewService` for why that is the right identity here rather than a shortcut.
 *
 * `not_found` returns 404 with the same body every time. A missing submission, a malformed
 * id and a submission belonging to someone else must be indistinguishable, or this endpoint
 * becomes a way to learn which ids exist.
 */
export async function handleFlotationPreview(req: Request, res: Response): Promise<void> {
  try {
    const preview = await getFlotationPreview(String(req.params.token || ''));

    if (preview.status === 'not_found') {
      res.status(404).json({ status: 'not_found' });
      return;
    }

    res.status(200).json(preview);
  } catch (err: any) {
    // The page polls this. An error here must not read as "your conversation is gone".
    console.error('[FlotationPreview] error:', err?.message);
    res.status(500).json({ status: 'error', message: 'We could not load this right now.' });
  }
}
