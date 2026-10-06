import { Router, Response } from 'express';
import { requireParticipant } from '../middlewares/participantAuth';
import { requireGovProjectAccess, type GovProjectRequest } from '../middlewares/govProjectAccess';
import { getStudentGovProjectView } from '../services/factory/govProjectProjection';

/**
 * govProjectPortalRoutes — the STUDENT entry point to an assigned government project.
 *
 * Guard chain, in order (the order is the security property):
 *   requireParticipant            — authenticate the student (sets req.participant.email)
 *   requireGovProjectAccess       — project-scoped membership: tenant guard first (audited, 404 cross-tenant),
 *                                   then delivery permission (404 for a NON-member so they cannot even learn the
 *                                   project exists, 403 for a member lacking the permission)
 *   -> getStudentGovProjectView   — a STUDENT-SAFE projection (never an admin/internal field)
 *
 * A student sees ONLY the gov projects they are a DeliveryProjectMember of; every other project id is a 404.
 * This does NOT use requireSection('program') — it would hand an intern the whole Program surface.
 */
const router = Router();

router.get(
  '/api/portal/gov-projects/:projectId',
  requireParticipant,
  requireGovProjectAccess('project.read'),
  async (req: GovProjectRequest, res: Response) => {
    // The guard already refused a non-string (repeated) param with 400; narrow again for type-safety + defense.
    const projectId = req.params.projectId;
    if (typeof projectId !== 'string' || !projectId) {
      res.status(400).json({ error: 'Project id is required' });
      return;
    }
    try {
      const view = await getStudentGovProjectView(projectId);
      // Access already passed the guard; a null here means the project is not a (non-archived) gov project.
      if (!view) {
        res.status(404).json({ error: 'Not found' });
        return;
      }
      res.json({ project: view });
    } catch {
      res.status(500).json({ error: 'Could not load the project.' });
    }
  },
);

export default router;
