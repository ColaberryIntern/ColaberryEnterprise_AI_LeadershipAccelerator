/**
 * requirementsDraft — single source of truth for the RequirementsBuilder's
 * in-progress draft key.
 *
 * The draft lets a user resume an interrupted build of THE PROJECT THEY ARE
 * CURRENTLY WORKING ON. With multi-project enrollments the draft is scoped to
 * the enrollment (JWT sub), so switching projects or starting a new one must
 * clear it — otherwise the new/other project's first-run flow resumes the
 * PREVIOUS project's finished state (e.g. lands on the "system is ready" card
 * instead of the 3-tier chooser). ProjectSwitcher calls clearRequirementsDraft
 * on both switch and new-project; RequirementsBuilder owns read/write.
 */
export function requirementsDraftKey(): string {
  try {
    const t = localStorage.getItem('participant_token') || '';
    const payload = JSON.parse(atob(t.split('.')[1] || ''));
    if (payload && payload.sub) return `requirements_builder_state:${payload.sub}`;
  } catch { /* fall through */ }
  return 'requirements_builder_state';
}

export function clearRequirementsDraft(): void {
  try { localStorage.removeItem(requirementsDraftKey()); } catch { /* ignore */ }
}
