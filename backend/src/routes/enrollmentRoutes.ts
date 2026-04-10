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

// Public: submit course/content feedback
router.post('/api/feedback', async (req: Request, res: Response) => {
  try {
    const { content_type, content_key, feedback_type, user_id, metadata } = req.body;
    if (!content_type || !content_key || !feedback_type) {
      res.status(400).json({ error: 'content_type, content_key, and feedback_type are required' });
      return;
    }
    const { ContentFeedback } = await import('../models');
    const feedback = await ContentFeedback.create({
      user_id: user_id || 'anonymous',
      content_type,
      content_key,
      feedback_type,
      metadata: metadata || {},
    });
    res.status(201).json(feedback);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public: submit AI capability assessment
router.post('/api/capabilities/build', async (req: Request, res: Response) => {
  try {
    const { enrollment_id, capabilities, self_assessment } = req.body;
    if (!enrollment_id) {
      res.status(400).json({ error: 'enrollment_id is required' });
      return;
    }
    const { Enrollment } = await import('../models');
    const enrollment = await Enrollment.findByPk(enrollment_id);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    // Store capability assessment in enrollment metadata
    const existing = (enrollment as any).metadata || {};
    await enrollment.update({
      metadata: {
        ...existing,
        capability_assessment: { capabilities, self_assessment, submitted_at: new Date().toISOString() },
      },
    } as any);
    res.status(201).json({ message: 'Capability assessment submitted', enrollment_id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public: generate a learning roadmap from program data
router.get('/api/roadmaps/generate', async (req: Request, res: Response) => {
  try {
    const { ProgramBlueprint, CurriculumModule } = await import('../models');
    const programId = req.query.program_id as string;

    const where: any = { is_active: true };
    if (programId) where.id = programId;

    const programs = await ProgramBlueprint.findAll({
      where,
      attributes: ['id', 'name', 'description', 'goals', 'core_competency_domains'],
      include: [{
        model: CurriculumModule,
        as: 'modules',
        attributes: ['id', 'module_number', 'title', 'description', 'skill_area', 'total_lessons'],
      }],
      order: [['name', 'ASC']],
    });

    // Transform into roadmap format
    const roadmaps = programs.map((p: any) => ({
      program_id: p.id,
      program_name: p.name,
      description: p.description,
      goals: p.goals || [],
      competency_domains: p.core_competency_domains || [],
      phases: (p.modules || [])
        .sort((a: any, b: any) => a.module_number - b.module_number)
        .map((m: any) => ({
          phase: m.module_number,
          title: m.title,
          description: m.description,
          skill_area: m.skill_area,
          total_lessons: m.total_lessons,
        })),
      total_modules: (p.modules || []).length,
    }));
    res.json(roadmaps);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public: submit presentation materials
router.post('/api/presentations/submit', async (req: Request, res: Response) => {
  try {
    const { enrollment_id, title, description, file_url, metadata } = req.body;
    if (!enrollment_id || !title) {
      res.status(400).json({ error: 'enrollment_id and title are required' });
      return;
    }
    const { Activity } = await import('../models');
    // Store as an activity linked to the enrollment's lead
    const { Enrollment } = await import('../models');
    const enrollment = await Enrollment.findByPk(enrollment_id, { attributes: ['id', 'lead_id'] });
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    const activity = await Activity.create({
      lead_id: (enrollment as any).lead_id || 0,
      type: 'presentation_submission',
      subject: title,
      body: description || '',
      metadata: { enrollment_id, file_url, ...metadata },
      created_at: new Date(),
    } as any);
    res.status(201).json({ message: 'Presentation submitted', activity_id: (activity as any).id });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// Public: submit assessment response
router.post('/api/assessments', async (req: Request, res: Response) => {
  try {
    const { enrollment_id, assessment_type, responses, score } = req.body;
    if (!enrollment_id || !assessment_type) {
      res.status(400).json({ error: 'enrollment_id and assessment_type are required' });
      return;
    }
    const { Enrollment } = await import('../models');
    const enrollment = await Enrollment.findByPk(enrollment_id);
    if (!enrollment) { res.status(404).json({ error: 'Enrollment not found' }); return; }

    // Store assessment in enrollment metadata
    const existing = (enrollment as any).metadata || {};
    const assessments = existing.assessments || [];
    assessments.push({
      assessment_type,
      responses,
      score,
      submitted_at: new Date().toISOString(),
    });
    await enrollment.update({
      metadata: { ...existing, assessments },
    } as any);
    res.status(201).json({ message: 'Assessment submitted', enrollment_id, assessment_type });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

export default router;
