import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { updateCohortSchema, createCohortSchema } from '../schemas/cohortSchema';
import {
  listAllCohorts,
  getCohortDetail,
  updateCohort,
  createCohort,
  deleteCohort,
  getDashboardStats,
} from '../services/cohortService';
import { generateEnrollmentCsv } from '../services/csvService';

function respondZodError(res: Response, error: ZodError): void {
  res.status(400).json({
    error: 'Validation failed',
    details: error.issues.map((i) => ({
      field: i.path.join('.'),
      message: i.message,
    })),
  });
}

export async function handleAdminListCohorts(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cohorts = await listAllCohorts();
    res.json({ cohorts });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminGetCohort(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const cohort = await getCohortDetail(req.params.id as string);
    res.json({ cohort });
  } catch (error) {
    next(error);
  }
}

export async function handleAdminUpdateCohort(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = updateCohortSchema.parse(req.body);
    const cohort = await updateCohort(req.params.id as string, data);
    res.json({ cohort });
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
  }
}

export async function handleAdminCreateCohort(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = createCohortSchema.parse(req.body);
    const cohort = await createCohort(data);
    res.status(201).json({ cohort });
  } catch (error) {
    if (error instanceof ZodError) {
      respondZodError(res, error);
      return;
    }
    next(error);
  }
}

export async function handleAdminDeleteCohort(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const force = req.query.force === 'true';
    const result = await deleteCohort(req.params.id as string, { force });
    if (!result.deleted) {
      res.status(409).json({
        error:
          'Cohort has a non-withdrawn, paid enrollment or a live session — refusing to ' +
          'cascade-delete without force=true',
        dependents: result.dependents,
      });
      return;
    }
    res.json(result);
  } catch (error) {
    next(error);
  }
}

export async function handleAdminExportCohort(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const csv = await generateEnrollmentCsv(req.params.id as string);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="cohort-${req.params.id as string}-enrollments.csv"`
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
}

export async function handleAdminGetStats(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await getDashboardStats();
    res.json({ stats });
  } catch (error) {
    next(error);
  }
}
