/** Display words shared by the board and the activity log (CH7.4). */
export const KIND_LABEL: Record<string, string> = {
  announcement: 'Announcement', reminder: 'Reminder', starting_soon: 'Starting soon', recording_thanks: 'Recording and thanks',
  time_change: 'Time change', cancellation: 'Cancelled', update: 'Update', other: 'Message',
};

/** A person as the page names them: the actor label is a staff sign-in email, shown by its name part ("jackie.k@..." -> "Jackie K"). */
export function personLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const local = label.includes('@') ? label.split('@')[0] : label;
  const words = local.split(/[._-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1));
  return words.length ? words.join(' ') : null;
}
