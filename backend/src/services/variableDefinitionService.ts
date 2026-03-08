import VariableDefinition from '../models/VariableDefinition';
const { v4: uuidv4 } = require('uuid');

export async function listVariableDefinitions(programId?: string) {
  const where: any = {};
  if (programId) where.program_id = programId;
  return VariableDefinition.findAll({ where, order: [['sort_order', 'ASC'], ['variable_key', 'ASC']] });
}

export async function getVariableDefinition(id: string) {
  const vd = await VariableDefinition.findByPk(id);
  if (!vd) throw new Error('Variable definition not found');
  return vd;
}

export async function createVariableDefinition(data: Partial<VariableDefinition>) {
  return VariableDefinition.create({ id: uuidv4(), ...data } as any);
}

export async function updateVariableDefinition(id: string, data: Partial<VariableDefinition>) {
  const vd = await VariableDefinition.findByPk(id);
  if (!vd) throw new Error('Variable definition not found');
  await vd.update(data);
  return vd;
}

export async function deleteVariableDefinition(id: string) {
  const vd = await VariableDefinition.findByPk(id);
  if (!vd) throw new Error('Variable definition not found');
  await vd.destroy();
  return { deleted: true };
}

export async function getRequiredVariables(programId?: string) {
  const where: any = { required_for_section_build: true, is_active: true };
  if (programId) where.program_id = programId;
  return VariableDefinition.findAll({ where, order: [['sort_order', 'ASC']] });
}
