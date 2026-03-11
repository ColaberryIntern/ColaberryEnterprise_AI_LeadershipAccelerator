import { Router } from 'express';
import type { Request, Response } from 'express';
import { BlueprintSnapshot } from '../../models';
import {
  createSnapshot,
  rollbackToSnapshot,
  listVersions,
  diffSnapshots,
} from '../../services/curriculumVersioningService';

const router = Router();

// ── List versions for a blueprint ────────────────────────────────────────
router.get('/curriculum/versions/:blueprintId', async (req: Request, res: Response) => {
  try {
    const versions = await listVersions(String(req.params.blueprintId));
    res.json({ versions });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Create snapshot ──────────────────────────────────────────────────────
router.post('/curriculum/versions/:blueprintId/snapshot', async (req: Request, res: Response) => {
  try {
    const { level, entity_id, description } = req.body;
    const snapshot = await createSnapshot(
      String(req.params.blueprintId),
      level || 'full',
      entity_id,
      description,
      (req as any).user?.id,
    );
    res.status(201).json(snapshot);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Preview curriculum from snapshot (read-only) ─────────────────────────
router.get('/preview/curriculum/:snapshotId', async (req: Request, res: Response) => {
  try {
    const snapshot = await BlueprintSnapshot.findByPk(String(req.params.snapshotId));
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    res.json({
      snapshot_id: (snapshot as any).id,
      version_number: (snapshot as any).version_number,
      level: (snapshot as any).snapshot_level,
      description: (snapshot as any).description,
      data: (snapshot as any).snapshot_data,
      created_at: (snapshot as any).created_at,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Promote snapshot (rollback to it) ────────────────────────────────────
router.post('/preview/curriculum/:snapshotId/promote', async (req: Request, res: Response) => {
  try {
    const result = await rollbackToSnapshot(String(req.params.snapshotId));
    res.json({ message: 'Snapshot promoted to live', snapshot: result });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// ── Diff two snapshots ───────────────────────────────────────────────────
router.get('/curriculum/versions/diff', async (req: Request, res: Response) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: 'Provide ?a=snapshotId&b=snapshotId' });
    const diff = await diffSnapshots(String(a), String(b));
    res.json(diff);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
