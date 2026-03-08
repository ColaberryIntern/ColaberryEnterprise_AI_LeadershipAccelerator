import { VariableStore, Enrollment } from '../models';
import { Op } from 'sequelize';

export async function setVariable(
  enrollmentId: string,
  key: string,
  value: string,
  scope: 'section' | 'session' | 'program' | 'artifact' = 'program',
  contextIds: { sectionId?: string; sessionId?: string; artifactId?: string } = {}
): Promise<VariableStore> {
  const [variable] = await VariableStore.findOrCreate({
    where: {
      enrollment_id: enrollmentId,
      variable_key: key,
      scope,
      ...(contextIds.sectionId ? { section_id: contextIds.sectionId } : {}),
      ...(contextIds.sessionId ? { session_id: contextIds.sessionId } : {}),
      ...(contextIds.artifactId ? { artifact_id: contextIds.artifactId } : {}),
    },
    defaults: {
      enrollment_id: enrollmentId,
      variable_key: key,
      variable_value: value,
      scope,
      section_id: contextIds.sectionId || null,
      session_id: contextIds.sessionId || null,
      artifact_id: contextIds.artifactId || null,
    } as any,
  });

  if (variable.variable_value !== value) {
    variable.variable_value = value;
    variable.updated_at = new Date();
    // Increment version on updates
    variable.version = (variable.version || 1) + 1;
    await variable.save();
  }

  return variable;
}

export async function getVariable(enrollmentId: string, key: string): Promise<string | null> {
  const variable = await VariableStore.findOne({
    where: { enrollment_id: enrollmentId, variable_key: key },
    order: [['updated_at', 'DESC']],
  });
  return variable?.variable_value || null;
}

export async function getVariablesByScope(
  enrollmentId: string,
  scope: string,
  contextId?: string
): Promise<Record<string, string>> {
  const where: any = { enrollment_id: enrollmentId, scope };
  if (scope === 'section' && contextId) where.section_id = contextId;
  if (scope === 'session' && contextId) where.session_id = contextId;
  if (scope === 'artifact' && contextId) where.artifact_id = contextId;

  const variables = await VariableStore.findAll({ where });
  const map: Record<string, string> = {};
  for (const v of variables) {
    map[v.variable_key] = v.variable_value || '';
  }
  return map;
}

export async function getAllVariables(enrollmentId: string): Promise<Record<string, string>> {
  const variables = await VariableStore.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['updated_at', 'DESC']],
  });

  const map: Record<string, string> = {};
  for (const v of variables) {
    if (!map[v.variable_key]) {
      map[v.variable_key] = v.variable_value || '';
    }
  }
  return map;
}

export async function resolveTemplate(enrollmentId: string, template: string): Promise<string> {
  const vars = await getAllVariables(enrollmentId);
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

export async function deleteVariable(enrollmentId: string, key: string): Promise<number> {
  return VariableStore.destroy({
    where: { enrollment_id: enrollmentId, variable_key: key },
  });
}

export async function getVariableDependencyGraph(enrollmentId: string): Promise<any[]> {
  const variables = await VariableStore.findAll({
    where: { enrollment_id: enrollmentId },
    order: [['created_at', 'ASC']],
  });

  return variables.map(v => ({
    key: v.variable_key,
    value: v.variable_value?.substring(0, 100),
    scope: v.scope,
    version: v.version || 1,
    sectionId: v.section_id,
    sessionId: v.session_id,
    artifactId: v.artifact_id,
    updatedAt: v.updated_at,
  }));
}

export async function getVariableHistory(enrollmentId: string, key: string): Promise<any[]> {
  const variables = await VariableStore.findAll({
    where: { enrollment_id: enrollmentId, variable_key: key },
    order: [['updated_at', 'DESC']],
  });
  return variables.map(v => ({
    id: v.id,
    value: v.variable_value,
    version: v.version || 1,
    scope: v.scope,
    updatedAt: v.updated_at,
  }));
}
