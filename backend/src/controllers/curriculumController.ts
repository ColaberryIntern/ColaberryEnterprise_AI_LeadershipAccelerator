import { Request, Response, NextFunction } from 'express';
import {
  getParticipantCurriculum,
  getModuleDetail,
  startLesson,
  completeLesson,
  submitLabData,
  checkSessionReadiness,
  getOrCreateCurriculumProfile,
  updateCurriculumProfile,
  overrideLessonStatus,
  getLabResponses,
  getModulesForCohort,
  saveQuizProgress,
  saveTaskProgress,
  gradeArtifacts,
  getOrchestrationContext,
} from '../services/curriculumService';
import { exportProjectArchitectData } from '../services/projectArchitectService';
import { getSkillGenome, getSkillGaps } from '../services/skillGenomeService';

/* ------------------------------------------------------------------ */
/*  Participant endpoints                                              */
/* ------------------------------------------------------------------ */

export async function handleGetCurriculum(req: Request, res: Response, next: NextFunction) {
  try {
    const curriculum = await getParticipantCurriculum(req.participant!.sub);
    res.json(curriculum);
  } catch (err) { next(err); }
}

export async function handleGetModuleDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getModuleDetail(req.participant!.sub, req.params.moduleId as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleStartLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await startLesson(req.participant!.sub, req.params.lessonId as string);
    res.json(result);
  } catch (err) {
    if ((err as Error).message?.includes('locked')) {
      return res.status(403).json({ error: (err as Error).message });
    }
    next(err);
  }
}

export async function handleCompleteLesson(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await completeLesson(req.participant!.sub, req.params.lessonId as string, req.body);
    res.json(result);
  } catch (err) {
    if ((err as Error).message?.includes('required') || (err as Error).message?.includes('locked')) {
      return res.status(400).json({ error: (err as Error).message });
    }
    next(err);
  }
}

export async function handleSubmitLabData(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await submitLabData(req.participant!.sub, req.params.lessonId as string, req.body);
    res.json(result);
  } catch (err) {
    if ((err as Error).message?.includes('Required field')) {
      return res.status(400).json({ error: (err as Error).message });
    }
    next(err);
  }
}

export async function handleCheckSessionReadiness(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await checkSessionReadiness(req.participant!.sub, req.params.sessionId as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetCurriculumProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await getOrCreateCurriculumProfile(req.participant!.sub);
    res.json({ profile });
  } catch (err) { next(err); }
}

export async function handleUpdateCurriculumProfile(req: Request, res: Response, next: NextFunction) {
  try {
    const profile = await updateCurriculumProfile(req.participant!.sub, req.body);
    res.json({ profile });
  } catch (err) { next(err); }
}

export async function handleGetSkillGenome(req: Request, res: Response, next: NextFunction) {
  try {
    const genome = await getSkillGenome(req.participant!.sub as string);
    res.json(genome);
  } catch (err) { next(err); }
}

export async function handleGetSkillGaps(req: Request, res: Response, next: NextFunction) {
  try {
    const gaps = await getSkillGaps(req.participant!.sub as string);
    res.json({ gaps });
  } catch (err) { next(err); }
}

export async function handleSaveQuizProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await saveQuizProgress(req.participant!.sub, req.params.lessonId as string, req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleSaveTaskProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await saveTaskProgress(req.participant!.sub, req.params.lessonId as string, req.body);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGradeArtifacts(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await gradeArtifacts(req.participant!.sub, req.params.lessonId as string, req.body.artifacts);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleGetOrchestrationContext(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getOrchestrationContext(req.participant!.sub, req.params.lessonId as string);
    res.json(result);
  } catch (err) { next(err); }
}

/* ------------------------------------------------------------------ */
/*  Admin endpoints                                                    */
/* ------------------------------------------------------------------ */

export async function handleAdminOverrideLessonStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const { enrollment_id, status } = req.body;
    const result = await overrideLessonStatus(enrollment_id, req.params.lessonId as string, status);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleAdminGetLabResponses(req: Request, res: Response, next: NextFunction) {
  try {
    const responses = await getLabResponses(req.params.enrollmentId as string);
    res.json({ responses });
  } catch (err) { next(err); }
}

export async function handleAdminListModules(req: Request, res: Response, next: NextFunction) {
  try {
    const modules = await getModulesForCohort(req.params.cohortId as string);
    res.json({ modules });
  } catch (err) { next(err); }
}

export async function handleAdminGetParticipantProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getParticipantCurriculum(req.params.enrollmentId as string);
    res.json(result);
  } catch (err) { next(err); }
}

export async function handleAdminExportProjectArchitect(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await exportProjectArchitectData(req.params.enrollmentId as string);
    res.json(result);
  } catch (err) { next(err); }
}
