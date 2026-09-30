// Mirrors backend/src/services/kbService.ts's MERGE_TAG_MAP so the admin UI
// can render a live preview and a clickable tag reference without a round
// trip for every keystroke. Keep this list in sync with the backend map.

export interface KbCohortLike {
  name: string;
  cohort_number: number;
  open_house_date: string | null;
  open_house_url: string | null;
  start_date: string | null;
  end_date: string | null;
  expo_date: string | null;
  price_annual: number | null;
  price_monthly: number | null;
  seats_total: number | null;
  seats_remaining: number | null;
  enrollment_url: string | null;
  waitlist_url: string | null;
}

export interface KbCourseLike {
  name: string;
  slug: string;
}

interface MergeTagDef {
  tag: string;
  label: string;
  resolve: (c: KbCohortLike, course: KbCourseLike) => string;
}

export const MERGE_TAGS: MergeTagDef[] = [
  { tag: '{{cohort.name}}', label: 'Cohort name', resolve: (c) => c.name ?? '[TBD]' },
  { tag: '{{cohort.number}}', label: 'Cohort number', resolve: (c) => String(c.cohort_number ?? '[TBD]') },
  { tag: '{{cohort.open_house_date}}', label: 'Open house date', resolve: (c) => c.open_house_date ?? '[TBD]' },
  { tag: '{{cohort.open_house_url}}', label: 'Open house URL', resolve: (c) => c.open_house_url ?? '[TBD]' },
  { tag: '{{cohort.start_date}}', label: 'Start date', resolve: (c) => c.start_date ?? '[TBD]' },
  { tag: '{{cohort.end_date}}', label: 'End date', resolve: (c) => c.end_date ?? '[TBD]' },
  { tag: '{{cohort.expo_date}}', label: 'Expo / demo date', resolve: (c) => c.expo_date ?? '[TBD]' },
  { tag: '{{cohort.price_annual}}', label: 'Annual price ($/mo)', resolve: (c) => (c.price_annual != null ? String(c.price_annual) : '[TBD]') },
  { tag: '{{cohort.price_monthly}}', label: 'Monthly price ($/mo)', resolve: (c) => (c.price_monthly != null ? String(c.price_monthly) : '[TBD]') },
  { tag: '{{cohort.seats_total}}', label: 'Total seats', resolve: (c) => (c.seats_total != null ? String(c.seats_total) : '[TBD]') },
  { tag: '{{cohort.seats_remaining}}', label: 'Seats remaining', resolve: (c) => (c.seats_remaining != null ? String(c.seats_remaining) : '[TBD]') },
  { tag: '{{cohort.enrollment_url}}', label: 'Enrollment URL', resolve: (c) => c.enrollment_url ?? '[TBD]' },
  { tag: '{{cohort.waitlist_url}}', label: 'Waitlist URL', resolve: (c) => c.waitlist_url ?? '[TBD]' },
  { tag: '{{course.name}}', label: 'Course name', resolve: (_c, course) => course.name ?? '[TBD]' },
  { tag: '{{course.slug}}', label: 'Course slug', resolve: (_c, course) => course.slug ?? '[TBD]' },
];

export function resolveMergeTagsClient(
  template: string,
  cohort: KbCohortLike | null,
  course: KbCourseLike | null
): string {
  if (!cohort || !course) return template;
  let resolved = template;
  for (const { tag, resolve } of MERGE_TAGS) {
    resolved = resolved.split(tag).join(resolve(cohort, course));
  }
  return resolved;
}

export function hasUnresolvedMergeTags(text: string): boolean {
  return text.includes('[TBD]');
}

/** Inserts text at the current cursor position of a textarea, falling back to append. */
export function insertAtCursor(textarea: HTMLTextAreaElement | null, current: string, insert: string): string {
  if (!textarea) return current + insert;
  const start = textarea.selectionStart ?? current.length;
  const end = textarea.selectionEnd ?? current.length;
  return current.slice(0, start) + insert + current.slice(end);
}
