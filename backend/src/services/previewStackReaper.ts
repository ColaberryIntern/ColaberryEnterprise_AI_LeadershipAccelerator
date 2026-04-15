/**
 * Preview Stack Idle Reaper
 *
 * Runs periodically and stops running preview stacks whose last_accessed_at
 * is older than the configured idle timeout. Stopped stacks preserve their
 * DB volume and repo clone; the next /preview/{slug}/ request will wake
 * them via the preview proxy middleware.
 */

import { Op } from 'sequelize';
import { PreviewStack } from '../models';
import { stopStack } from './previewStackService';

const IDLE_MS = parseInt(process.env.PREVIEW_IDLE_TIMEOUT_MS || '1800000', 10); // 30 min

export async function reapIdlePreviewStacks(): Promise<{ checked: number; stopped: string[] }> {
  const cutoff = new Date(Date.now() - IDLE_MS);
  const candidates = await PreviewStack.findAll({
    where: {
      status: 'running',
      [Op.or]: [
        { last_accessed_at: { [Op.lt]: cutoff } },
        // Stacks that are running but have never been accessed — use last_started_at
        {
          last_accessed_at: null,
          last_started_at: { [Op.lt]: cutoff },
        },
      ],
    },
  });
  const stopped: string[] = [];
  for (const stack of candidates) {
    try {
      await stopStack((stack as any).project_id);
      stopped.push((stack as any).slug);
    } catch (err: any) {
      console.error(`[previewStackReaper] stopStack failed for ${(stack as any).slug}:`, err?.message);
    }
  }
  return { checked: candidates.length, stopped };
}
