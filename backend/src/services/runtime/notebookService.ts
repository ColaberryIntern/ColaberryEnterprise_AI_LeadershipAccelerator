/**
 * notebookService — the student's AI Notebook: notes, bookmarks, highlights,
 * flashcards. Per-student, searchable. Simple CRUD; the intelligence (flashcard
 * generation, summaries) is produced by the mentor and saved here.
 */
import { Op } from 'sequelize';
import RuntimeNote from '../../models/RuntimeNote';

export async function listNotes(enrollmentId: string, opts: { kind?: string; q?: string } = {}) {
  const where: any = { enrollment_id: enrollmentId };
  if (opts.kind) where.kind = opts.kind;
  if (opts.q) where[Op.or as any] = [{ title: { [Op.iLike]: `%${opts.q}%` } }, { body: { [Op.iLike]: `%${opts.q}%` } }];
  const rows = await RuntimeNote.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
  return rows.map((r) => r.toJSON());
}

export async function createNote(enrollmentId: string, input: { card_id?: string | null; kind?: string; title?: string; body?: string; back?: string }) {
  const note = await RuntimeNote.create({
    enrollment_id: enrollmentId, card_id: input.card_id ?? null,
    kind: ['note', 'bookmark', 'highlight', 'flashcard'].includes(input.kind || '') ? input.kind : 'note',
    title: input.title ?? null, body: input.body ?? null, back: input.back ?? null,
  });
  return note.toJSON();
}

export async function deleteNote(enrollmentId: string, id: string) {
  const n = await RuntimeNote.findOne({ where: { id, enrollment_id: enrollmentId } });
  if (!n) throw Object.assign(new Error('Note not found'), { status: 404 });
  await n.destroy();
  return { deleted: true };
}
