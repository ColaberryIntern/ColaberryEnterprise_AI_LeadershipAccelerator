import { Router, Request, Response } from 'express';
import { requireAdmin } from '../../middlewares/authMiddleware';
import {
  CreateEntrySchema, UpdateEntrySchema,
  CreatePersonSchema, UpdatePersonSchema,
  CreateCohortSchema, UpdateCohortSchema,
  PreviewSchema, ExportSchema,
} from '../../schemas/kbSchemas';
import * as kb from '../../services/kbService';

const router = Router();

// ── Courses (read-only via admin; new courses seeded or added via migration) ──
router.get('/api/admin/kb/courses', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const courses = await kb.listCourses();
    res.json({ courses });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list courses', error_class: 'InternalError' });
  }
});

// ── Cohorts ──────────────────────────────────────────────────────────────────
router.get('/api/admin/kb/cohorts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const courseId = typeof req.query.course_id === 'string' ? req.query.course_id : undefined;
    const cohorts = await kb.listCohorts(courseId);
    res.json({ cohorts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list cohorts', error_class: 'InternalError' });
  }
});

router.post('/api/admin/kb/cohorts', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const cohort = await kb.createCohort(parsed.data);
    res.status(201).json({ cohort });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create cohort', error_class: 'InternalError' });
  }
});

router.put('/api/admin/kb/cohorts/:id', requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateCohortSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const cohort = await kb.updateCohort(req.params.id as string, parsed.data);
    if (!cohort) { res.status(404).json({ error: 'Cohort not found' }); return; }
    res.json({ cohort });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update cohort', error_class: 'InternalError' });
  }
});

router.post('/api/admin/kb/cohorts/:id/activate', requireAdmin, async (req: Request, res: Response) => {
  try {
    const cohort = await kb.activateCohort(req.params.id as string);
    if (!cohort) { res.status(404).json({ error: 'Cohort not found' }); return; }
    res.json({ cohort });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate cohort', error_class: 'InternalError' });
  }
});

// ── Responsible persons ──────────────────────────────────────────────────────
router.get('/api/admin/kb/persons', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const persons = await kb.listPersons();
    res.json({ persons });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list persons', error_class: 'InternalError' });
  }
});

router.post('/api/admin/kb/persons', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreatePersonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const person = await kb.createPerson(parsed.data);
    res.status(201).json({ person });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create person', error_class: 'InternalError' });
  }
});

router.put('/api/admin/kb/persons/:id', requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdatePersonSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const person = await kb.updatePerson(req.params.id as string, parsed.data);
    if (!person) { res.status(404).json({ error: 'Person not found' }); return; }
    res.json({ person });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update person', error_class: 'InternalError' });
  }
});

// ── KB Entries ───────────────────────────────────────────────────────────────
router.get('/api/admin/kb/entries', requireAdmin, async (req: Request, res: Response) => {
  try {
    const courseId = typeof req.query.course_id === 'string' ? req.query.course_id : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const activeOnly = req.query.active !== 'false';
    const entries = await kb.listEntries({ courseId, category, activeOnly });
    res.json({ entries });
  } catch (err) {
    res.status(500).json({ error: 'Failed to list entries', error_class: 'InternalError' });
  }
});

router.post('/api/admin/kb/entries', requireAdmin, async (req: Request, res: Response) => {
  const parsed = CreateEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const entry = await kb.createEntry(parsed.data);
    res.status(201).json({ entry });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create entry', error_class: 'InternalError' });
  }
});

router.put('/api/admin/kb/entries/:id', requireAdmin, async (req: Request, res: Response) => {
  const parsed = UpdateEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const entry = await kb.updateEntry(req.params.id as string, parsed.data);
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }
    res.json({ entry });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update entry', error_class: 'InternalError' });
  }
});

router.delete('/api/admin/kb/entries/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const entry = await kb.softDeleteEntry(req.params.id as string);
    if (!entry) { res.status(404).json({ error: 'Entry not found' }); return; }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to deactivate entry', error_class: 'InternalError' });
  }
});

// ── Preview (resolve merge tags live) ────────────────────────────────────────
router.get('/api/admin/kb/preview', requireAdmin, async (req: Request, res: Response) => {
  const parsed = PreviewSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const resolved = await kb.previewEntry(parsed.data.entry_id, parsed.data.cohort_id);
    if (resolved === null) { res.status(404).json({ error: 'Entry not found' }); return; }
    res.json({ resolved });
  } catch (err) {
    res.status(500).json({ error: 'Preview failed', error_class: 'InternalError' });
  }
});

// ── Synthflow CSV export ──────────────────────────────────────────────────────
router.get('/api/admin/kb/export/synthflow', requireAdmin, async (req: Request, res: Response) => {
  const parsed = ExportSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.flatten() });
    return;
  }
  try {
    const { rows, skipped } = await kb.buildSynthflowExport(
      parsed.data.course_id,
      parsed.data.force_include_unresolved
    );
    // Column order matches the real Google Sheet rubric Synthflow consumes
    // (confirmed by Kes 2026-07-06) — not the earlier internal draft shape.
    const headers = [
      'Main Category', 'Main Category Qualifier', 'Sub Category', 'Full Category',
      'Question (From Real Emails)', 'Answer (Based on Patterns)', 'Generated Date',
      'Real Email Examples', 'Common Questions/Patterns', 'Responsible Person/Email',
      'Escalation Logic', 'Calendar Link', 'Priority Level', 'Expected Response Time',
      'Automation Potential', 'Emotional Tone Indicators',
    ];
    const csv = [
      headers.join(','),
      ...rows.map((r) =>
        [
          r.main_category, r.main_category_qualifier, r.sub_category, r.full_category,
          r.question, r.answer, r.generated_date,
          r.email_examples, r.keywords, r.responsible_person_email,
          r.escalation_logic, r.calendar_link, r.priority, r.response_time,
          r.automation_potential, r.emotional_tone,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      ),
    ].join('\r\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="synthflow-kb-export.csv"');
    res.setHeader('X-Skipped-Entries', String(skipped));
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'Export failed', error_class: 'InternalError' });
  }
});

export default router;
