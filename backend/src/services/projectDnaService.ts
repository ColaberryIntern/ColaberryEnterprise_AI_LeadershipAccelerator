import { QueryTypes } from 'sequelize';
import { randomUUID } from 'crypto';
import { sequelize } from '../config/database';
import ProjectDna from '../models/ProjectDna';

function log(level: 'info' | 'error', event: string, enrollmentId: string, extra?: Record<string, unknown>) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'backend',
    event,
    correlation_id: randomUUID(),
    outcome: level === 'error' ? 'failure' : 'success',
    context: { enrollment_id: enrollmentId, ...extra },
  }));
}

export interface ProjectDnaInput {
  businessProblem: string;
  targetUser: string;
  industry: string;
  orientation: 'internal' | 'external';
  focus: 'revenue' | 'operational';
  projectTypes: string[];
  dataSources: string[];
  aiComponents: string[];
  industryTrack: string;
}

export interface ProjectDnaRecord {
  id: string;
  enrollment_id: string;
  business_problem: string;
  target_user: string;
  industry: string;
  orientation: 'internal' | 'external';
  focus: 'revenue' | 'operational';
  project_types: string[];
  data_sources: string[];
  ai_components: string[];
  industry_track: string;
  created_at: Date;
  updated_at: Date;
}

// Upsert: first save wins on created_at; every subsequent call updates all fields.
// Idempotency key: enrollment_id (unique constraint on the table).
export async function saveProjectDna(
  enrollmentId: string,
  input: ProjectDnaInput
): Promise<ProjectDnaRecord> {
  const start = Date.now();
  await sequelize.query(
    `INSERT INTO project_dna
       (enrollment_id, business_problem, target_user, industry, orientation, focus,
        project_types, data_sources, ai_components, industry_track, updated_at)
     VALUES
       (:enrollmentId, :businessProblem, :targetUser, :industry, :orientation, :focus,
        :projectTypes::jsonb, :dataSources::jsonb, :aiComponents::jsonb, :industryTrack, NOW())
     ON CONFLICT (enrollment_id) DO UPDATE SET
       business_problem = EXCLUDED.business_problem,
       target_user      = EXCLUDED.target_user,
       industry         = EXCLUDED.industry,
       orientation      = EXCLUDED.orientation,
       focus            = EXCLUDED.focus,
       project_types    = EXCLUDED.project_types,
       data_sources     = EXCLUDED.data_sources,
       ai_components    = EXCLUDED.ai_components,
       industry_track   = EXCLUDED.industry_track,
       updated_at       = NOW()`,
    {
      type: QueryTypes.INSERT,
      replacements: {
        enrollmentId,
        businessProblem: input.businessProblem,
        targetUser: input.targetUser,
        industry: input.industry,
        orientation: input.orientation,
        focus: input.focus,
        projectTypes: JSON.stringify(input.projectTypes),
        dataSources: JSON.stringify(input.dataSources),
        aiComponents: JSON.stringify(input.aiComponents),
        industryTrack: input.industryTrack,
      },
    }
  );

  const record = await ProjectDna.findOne({ where: { enrollment_id: enrollmentId } });
  if (!record) throw new Error('ProjectDna upsert succeeded but row not found');
  log('info', 'project_dna_saved', enrollmentId, { duration_ms: Date.now() - start });
  return record as unknown as ProjectDnaRecord;
}

export async function getProjectDna(enrollmentId: string): Promise<ProjectDnaRecord | null> {
  const record = await ProjectDna.findOne({ where: { enrollment_id: enrollmentId } });
  log('info', 'project_dna_fetched', enrollmentId, { found: !!record });
  return record as unknown as ProjectDnaRecord | null;
}
