import SessionChecklist from '../models/SessionChecklist';
const { v4: uuidv4 } = require('uuid');

export async function listChecklistItems(sessionId: string) {
  return SessionChecklist.findAll({
    where: { session_id: sessionId },
    order: [['sort_order', 'ASC']],
  });
}

export async function createChecklistItem(sessionId: string, data: Partial<SessionChecklist>) {
  const maxOrder = await SessionChecklist.max('sort_order', { where: { session_id: sessionId } }) as number || 0;
  return SessionChecklist.create({
    id: uuidv4(),
    session_id: sessionId,
    sort_order: maxOrder + 1,
    ...data,
  } as any);
}

export async function updateChecklistItem(id: string, data: Partial<SessionChecklist>) {
  const item = await SessionChecklist.findByPk(id);
  if (!item) throw new Error('Checklist item not found');
  await item.update(data);
  return item;
}

export async function deleteChecklistItem(id: string) {
  const item = await SessionChecklist.findByPk(id);
  if (!item) throw new Error('Checklist item not found');
  await item.destroy();
  return { deleted: true };
}
