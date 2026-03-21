import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';

const router = Router();

/**
 * GET /api/admin/artifact-relationships
 * Get full artifact graph (nodes + edges), optionally filtered by programId.
 */
router.get('/api/admin/artifact-relationships', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getFullGraph } = await import('../../services/artifactGraphService');
    const programId = req.query.programId as string | undefined;
    const graph = await getFullGraph(programId);
    res.json(graph);
  } catch (err: any) {
    console.error('[ArtifactRelationships] GET error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/artifact-relationships/:artifactId/tree
 * Get dependency tree for a specific artifact.
 */
router.get('/api/admin/artifact-relationships/:artifactId/tree', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { getDependencyTree, getAncestorChain } = await import('../../services/artifactGraphService');
    const artifactId = req.params.artifactId as string;
    const direction = (req.query.direction as string) === 'up' ? 'up' : 'down';
    const tree = direction === 'up'
      ? await getAncestorChain(artifactId)
      : await getDependencyTree(artifactId);
    res.json({ artifactId, direction, nodes: tree });
  } catch (err: any) {
    console.error('[ArtifactRelationships] GET tree error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/artifact-relationships
 * Create a new artifact relationship edge.
 */
router.post('/api/admin/artifact-relationships', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { addRelationship } = await import('../../services/artifactGraphService');
    const { parent_artifact_id, child_artifact_id, relationship_type, metadata } = req.body;

    if (!parent_artifact_id || !child_artifact_id || !relationship_type) {
      res.status(400).json({ error: 'parent_artifact_id, child_artifact_id, and relationship_type are required' });
      return;
    }

    const edge = await addRelationship(parent_artifact_id, child_artifact_id, relationship_type, metadata);
    res.status(201).json(edge);
  } catch (err: any) {
    console.error('[ArtifactRelationships] POST error:', err.message);
    const status = err.message.includes('not found') || err.message.includes('cycle') ? 400 : 500;
    res.status(status).json({ error: err.message });
  }
});

/**
 * DELETE /api/admin/artifact-relationships/:id
 * Remove an artifact relationship edge.
 */
router.delete('/api/admin/artifact-relationships/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { removeRelationship } = await import('../../services/artifactGraphService');
    const deleted = await removeRelationship(req.params.id as string);
    if (!deleted) {
      res.status(404).json({ error: 'Relationship not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: any) {
    console.error('[ArtifactRelationships] DELETE error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
