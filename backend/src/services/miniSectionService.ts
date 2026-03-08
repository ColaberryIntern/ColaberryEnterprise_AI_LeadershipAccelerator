import MiniSection from '../models/MiniSection';
import PromptTemplate from '../models/PromptTemplate';
const { v4: uuidv4 } = require('uuid');

export async function listMiniSections(lessonId: string) {
  return MiniSection.findAll({
    where: { lesson_id: lessonId },
    include: [
      { model: PromptTemplate, as: 'conceptPrompt', attributes: ['id', 'name'] },
      { model: PromptTemplate, as: 'buildPrompt', attributes: ['id', 'name'] },
      { model: PromptTemplate, as: 'mentorPrompt', attributes: ['id', 'name'] },
    ],
    order: [['mini_section_order', 'ASC']],
  });
}

export async function getMiniSection(id: string) {
  const ms = await MiniSection.findByPk(id, {
    include: [
      { model: PromptTemplate, as: 'conceptPrompt' },
      { model: PromptTemplate, as: 'buildPrompt' },
      { model: PromptTemplate, as: 'mentorPrompt' },
    ],
  });
  if (!ms) throw new Error('Mini-section not found');
  return ms;
}

export async function createMiniSection(lessonId: string, data: Partial<MiniSection>) {
  const maxOrder = await MiniSection.max('mini_section_order', { where: { lesson_id: lessonId } }) as number || 0;
  return MiniSection.create({
    id: uuidv4(),
    lesson_id: lessonId,
    mini_section_order: maxOrder + 1,
    ...data,
  } as any);
}

export async function updateMiniSection(id: string, data: Partial<MiniSection>) {
  const ms = await MiniSection.findByPk(id);
  if (!ms) throw new Error('Mini-section not found');
  await ms.update(data);
  return ms;
}

export async function deleteMiniSection(id: string) {
  const ms = await MiniSection.findByPk(id);
  if (!ms) throw new Error('Mini-section not found');
  await ms.destroy();
  return { deleted: true };
}

export async function reorderMiniSections(lessonId: string, orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    await MiniSection.update(
      { mini_section_order: i + 1 },
      { where: { id: orderedIds[i], lesson_id: lessonId } }
    );
  }
  return listMiniSections(lessonId);
}
