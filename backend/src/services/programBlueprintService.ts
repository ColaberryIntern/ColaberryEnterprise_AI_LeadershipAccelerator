import ProgramBlueprint from '../models/ProgramBlueprint';
import CurriculumModule from '../models/CurriculumModule';
import Cohort from '../models/Cohort';
const { v4: uuidv4 } = require('uuid');

export async function listPrograms() {
  return ProgramBlueprint.findAll({
    order: [['created_at', 'DESC']],
  });
}

export async function getProgram(id: string) {
  const program = await ProgramBlueprint.findByPk(id, {
    include: [
      { model: CurriculumModule, as: 'modules', attributes: ['id', 'module_number', 'title', 'skill_area'] },
      { model: Cohort, as: 'cohorts', attributes: ['id', 'name', 'status'] },
    ],
  });
  if (!program) throw new Error('Program blueprint not found');
  return program;
}

export async function createProgram(data: Partial<ProgramBlueprint>) {
  return ProgramBlueprint.create({
    id: uuidv4(),
    ...data,
  } as any);
}

export async function updateProgram(id: string, data: Partial<ProgramBlueprint>) {
  const program = await ProgramBlueprint.findByPk(id);
  if (!program) throw new Error('Program blueprint not found');
  await program.update(data);
  return program;
}

export async function deleteProgram(id: string) {
  const program = await ProgramBlueprint.findByPk(id);
  if (!program) throw new Error('Program blueprint not found');

  // Check for linked modules/cohorts
  const moduleCount = await CurriculumModule.count({ where: { program_id: id } });
  const cohortCount = await Cohort.count({ where: { program_id: id } });
  if (moduleCount > 0 || cohortCount > 0) {
    throw new Error(`Cannot delete: ${moduleCount} modules and ${cohortCount} cohorts linked to this program`);
  }

  await program.destroy();
  return { deleted: true };
}

export async function cloneProgram(id: string) {
  const source = await ProgramBlueprint.findByPk(id);
  if (!source) throw new Error('Program blueprint not found');

  const clone = await ProgramBlueprint.create({
    id: uuidv4(),
    name: `${source.name} (Copy)`,
    description: source.description,
    goals: source.goals,
    target_persona: source.target_persona,
    learning_philosophy: source.learning_philosophy,
    core_competency_domains: source.core_competency_domains,
    skill_genome_mapping: source.skill_genome_mapping,
    default_prompt_injection_rules: source.default_prompt_injection_rules,
    is_active: false,
    version: 1,
  } as any);

  return clone;
}
