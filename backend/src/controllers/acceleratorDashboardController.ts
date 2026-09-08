/**
 * acceleratorDashboardController — HTTP boundary for the Accelerator page's
 * "current classes" snapshot and its Timeline-backed Curriculum tab.
 *
 * Thin by design: every decision lives in the two services, so the rules that
 * define "a class running right now" stay unit-testable without Express.
 */
import { Request, Response, NextFunction } from 'express';
import { getCurrentClassesSnapshot } from '../services/acceleratorCurrentClassesService';
import {
  getCohortCurriculum,
  getParticipantCurriculumProgress,
} from '../services/acceleratorCohortCurriculumService';

export async function handleGetCurrentClasses(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getCurrentClassesSnapshot());
  } catch (err) { next(err); }
}

export async function handleGetCohortCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getCohortCurriculum(String(req.params.cohortId)));
  } catch (err) { next(err); }
}

export async function handleGetCohortCurriculumProgress(
  req: Request, res: Response, next: NextFunction
) {
  try {
    res.json(await getParticipantCurriculumProgress(
      String(req.params.cohortId),
      String(req.params.enrollmentId)
    ));
  } catch (err) { next(err); }
}
