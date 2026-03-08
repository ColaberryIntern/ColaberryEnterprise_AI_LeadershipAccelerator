import { ArtifactDefinition, AssignmentSubmission, VariableStore } from '../models';
import * as variableService from './variableService';

export async function listArtifactDefinitions(sessionId?: string): Promise<ArtifactDefinition[]> {
  const where: any = {};
  if (sessionId) where.session_id = sessionId;
  return ArtifactDefinition.findAll({ where, order: [['sort_order', 'ASC']] });
}

export async function getArtifactDefinition(id: string): Promise<ArtifactDefinition | null> {
  return ArtifactDefinition.findByPk(id);
}

export async function createArtifactDefinition(data: Partial<ArtifactDefinition>): Promise<ArtifactDefinition> {
  return ArtifactDefinition.create(data as any);
}

export async function updateArtifactDefinition(
  id: string,
  data: Partial<ArtifactDefinition>
): Promise<ArtifactDefinition | null> {
  const artifact = await ArtifactDefinition.findByPk(id);
  if (!artifact) return null;
  await artifact.update(data);
  return artifact;
}

export async function deleteArtifactDefinition(id: string): Promise<boolean> {
  const count = await ArtifactDefinition.destroy({ where: { id } });
  return count > 0;
}

export async function checkArtifactCompletion(
  enrollmentId: string,
  artifactDefinitionId: string
): Promise<boolean> {
  const submission = await AssignmentSubmission.findOne({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: artifactDefinitionId,
      status: ['submitted', 'reviewed'],
    },
  });
  return !!submission;
}

export async function getArtifactStatus(
  enrollmentId: string,
  sessionId: string
): Promise<{
  definitions: any[];
  completedCount: number;
  totalCount: number;
}> {
  const definitions = await ArtifactDefinition.findAll({
    where: { session_id: sessionId },
    order: [['sort_order', 'ASC']],
  });

  const submissions = await AssignmentSubmission.findAll({
    where: {
      enrollment_id: enrollmentId,
      artifact_definition_id: definitions.map(d => d.id),
    },
  });

  const submissionMap = new Map<string, any>();
  for (const sub of submissions) {
    submissionMap.set(sub.artifact_definition_id, sub);
  }

  const result = definitions.map(def => ({
    id: def.id,
    name: def.name,
    description: def.description,
    artifact_type: def.artifact_type,
    required_for_session: def.required_for_session,
    required_for_build_unlock: def.required_for_build_unlock,
    required_for_presentation_unlock: def.required_for_presentation_unlock,
    evaluation_criteria: def.evaluation_criteria,
    completed: !!submissionMap.get(def.id),
    submission: submissionMap.get(def.id) || null,
  }));

  return {
    definitions: result,
    completedCount: result.filter(r => r.completed).length,
    totalCount: result.length,
  };
}

export async function onArtifactSubmitted(
  enrollmentId: string,
  artifactDefinitionId: string,
  submissionContent: string
): Promise<void> {
  const definition = await ArtifactDefinition.findByPk(artifactDefinitionId);
  if (!definition) return;

  const variableKeys = definition.produces_variable_keys || [];
  for (const key of variableKeys) {
    await variableService.setVariable(enrollmentId, key, submissionContent, 'artifact', {
      artifactId: artifactDefinitionId,
      sessionId: definition.session_id || undefined,
    });
  }
}

export async function getBuildUnlockArtifacts(sessionId?: string): Promise<ArtifactDefinition[]> {
  const where: any = { required_for_build_unlock: true };
  if (sessionId) where.session_id = sessionId;
  return ArtifactDefinition.findAll({ where });
}

export async function getPresentationUnlockArtifacts(): Promise<ArtifactDefinition[]> {
  return ArtifactDefinition.findAll({
    where: { required_for_presentation_unlock: true },
  });
}
