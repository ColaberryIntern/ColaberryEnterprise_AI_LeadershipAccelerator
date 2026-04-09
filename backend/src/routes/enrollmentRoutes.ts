import { Router, Request, Response } from 'express';
import {
  handleListOpenCohorts,
  handleCreateInvoice,
  handleCreateInvoiceRequest,
  handleVerifyEnrollment,
} from '../controllers/enrollmentController';

const router = Router();

router.get('/api/cohorts', handleListOpenCohorts);
router.post('/api/create-invoice', handleCreateInvoice);
router.post('/api/create-invoice-request', handleCreateInvoiceRequest);
router.get('/api/enrollment/verify', handleVerifyEnrollment);

// Public: list available courses (active program blueprints with modules)
router.get('/api/courses', async (_req: Request, res: Response) => {
  try {
    const { ProgramBlueprint, CurriculumModule } = await import('../models');
    const programs = await ProgramBlueprint.findAll({
      where: { is_active: true },
      attributes: ['id', 'name', 'description', 'goals', 'target_persona', 'learning_philosophy', 'core_competency_domains'],
      include: [{
        model: CurriculumModule,
        as: 'modules',
        attributes: ['id', 'module_number', 'title', 'description', 'skill_area', 'total_lessons'],
        order: [['module_number', 'ASC']],
      }],
      order: [['name', 'ASC']],
    });
    res.json(programs);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
