import ChecklistInstance from '../../models/ChecklistInstance';

/** Read-only, cheap DB lookup — the checklist instance for one real subject
 * (e.g. one student_assessment row), or `null` if none was ever created.
 * Generic across checklist types, reusable by Outreach/Closure once those
 * ship their own checklists. */
export async function getChecklistForSubject(subjectType: string, subjectId: string): Promise<ChecklistInstance | null> {
  return ChecklistInstance.findOne({
    where: { subject_type: subjectType, subject_id: subjectId },
    order: [['created_at', 'DESC']],
  });
}
