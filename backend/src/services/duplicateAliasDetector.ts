import { Op } from 'sequelize';
import { Enrollment, CommunityMember, Subscription, AttendanceRecord } from '../models';

/**
 * Same person, two email addresses, one cohort. REPORT ONLY.
 *
 * duplicateAccountSweepService groups by exact email, so a student who
 * enrolled with one address and paid with another is invisible to it. Found
 * on 2026-09-19 from a Session 17 check-in: one learner's first row (where
 * her project and attendance live) and her second row, under another
 * address (where the paid subscription lives), were both active in one cohort. The yahoo row had 10
 * auto-absents, one per class, and that address had received 8 "Missed
 * Session" emails for classes she attended, including one she checked into
 * at 6:46 PM. A second learner had the same split via a `+2` alias.
 * The sweep had run daily the whole time and never saw either.
 *
 * Matching is on a normalised full name OR the email's local part with any
 * `+tag` stripped, within ONE cohort. That is evidence, not proof: two
 * different people can share a name. So nothing here writes. It lists each
 * group with what each row holds (attendance, auto-absents, a real payment),
 * which is what a person needs to decide which row is the one they use and
 * which one pays, and to merge by hand. Moving a paid subscription between
 * rows is exactly what the sweep refuses to automate, for the same reason.
 *
 * Excluded: staff rows (a community mgmt_role), colaberry.com and test
 * domains, and internship rows (never a duplicate of a class row; see the
 * note in duplicateAccountSweepService).
 */

export interface AliasRowInput {
  id: string;
  email: string;
  full_name?: string | null;
  cohort_id?: string | null;
}

export interface AliasDuplicate {
  cohortId: string;
  name: string;
  matchedOn: Array<'name' | 'email'>;
  rows: Array<{ id: string; email: string; attended: number; autoAbsent: number; paid: boolean }>;
}

const MIN_LOCAL_PART = 5; // "info", "mail", "john" are too common to mean one person

/** Normalised full name: lowercase, accents and punctuation dropped, whitespace collapsed. Null for a single word. */
export function nameKey(fullName: string | null | undefined): string | null {
  const n = (fullName || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n.split(' ').length >= 2 ? n : null;
}

/** Email local part with any +tag removed. Null when too short to identify a person. */
export function localKey(email: string): string | null {
  const local = email.toLowerCase().trim().split('@')[0].split('+')[0];
  return local.length >= MIN_LOCAL_PART ? local : null;
}

/**
 * Pure. Groups rows that look like one person within one cohort. A group
 * must span at least two DIFFERENT emails; same-email duplicates belong to
 * the sweep's own detectors. Linked transitively (union-find), so a name
 * match plus a local-part match still makes one group.
 */
export function groupAliasRows(rows: AliasRowInput[]): Array<{ rows: AliasRowInput[]; matchedOn: Array<'name' | 'email'> }> {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  const union = (a: string, b: string) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(rb, ra); };
  const how = new Map<string, Set<'name' | 'email'>>();

  for (const r of rows) parent.set(r.id, r.id);
  const firstByKey = new Map<string, string>();
  for (const r of rows) {
    if (!r.cohort_id) continue;
    const keys: Array<[string, 'name' | 'email']> = [];
    const n = nameKey(r.full_name);
    const l = localKey(r.email);
    if (n) keys.push([`${r.cohort_id}|n|${n}`, 'name']);
    if (l) keys.push([`${r.cohort_id}|l|${l}`, 'email']);
    for (const [k, kind] of keys) {
      const first = firstByKey.get(k);
      if (!first) { firstByKey.set(k, r.id); continue; }
      union(first, r.id);
      for (const id of [first, r.id]) (how.get(id) || how.set(id, new Set()).get(id)!).add(kind);
    }
  }

  const groups = new Map<string, AliasRowInput[]>();
  for (const r of rows) {
    const root = find(r.id);
    (groups.get(root) || groups.set(root, []).get(root)!).push(r);
  }
  const out: Array<{ rows: AliasRowInput[]; matchedOn: Array<'name' | 'email'> }> = [];
  for (const g of groups.values()) {
    const emails = new Set(g.map((r) => r.email.toLowerCase().trim()));
    if (g.length < 2 || emails.size < 2) continue;
    const matched = new Set<'name' | 'email'>();
    for (const r of g) how.get(r.id)?.forEach((k) => matched.add(k));
    out.push({ rows: g, matchedOn: (['name', 'email'] as const).filter((k) => matched.has(k)) });
  }
  return out;
}

const EXCLUDED_DOMAIN = /@(colaberry\.com|colaberry-test\.local)$/i;

export async function findAliasDuplicates(): Promise<AliasDuplicate[]> {
  const all = ((await Enrollment.findAll({
    where: { status: 'active', portal_enabled: true },
    include: [{ model: CommunityMember, as: 'communityMember', attributes: ['mgmt_role'] }],
  })) || []) as any[];

  const candidates: AliasRowInput[] = all
    .filter((r) => r.enrollment_type !== 'internship')
    .filter((r) => !EXCLUDED_DOMAIN.test(String(r.email || '')))
    .filter((r) => !r.communityMember?.mgmt_role)
    .map((r) => ({ id: r.id, email: String(r.email), full_name: r.full_name, cohort_id: r.cohort_id }));

  const groups = groupAliasRows(candidates);
  if (groups.length === 0) return [];

  const ids = groups.flatMap((g) => g.rows.map((r) => r.id));
  const [attendance, subs] = await Promise.all([
    AttendanceRecord.findAll({ where: { enrollment_id: { [Op.in]: ids } }, attributes: ['enrollment_id', 'status', 'marked_by'] }),
    Subscription.findAll({ where: { enrollment_id: { [Op.in]: ids } }, attributes: ['enrollment_id', 'paysimple_payment_id'] }),
  ]);
  const stats = new Map<string, { attended: number; autoAbsent: number; paid: boolean }>();
  for (const id of ids) stats.set(id, { attended: 0, autoAbsent: 0, paid: false });
  for (const a of (attendance || []) as any[]) {
    const s = stats.get(a.enrollment_id);
    if (!s) continue;
    if (['present', 'late', 'excused'].includes(a.status)) s.attended += 1;
    else if (a.status === 'absent' && a.marked_by === 'system') s.autoAbsent += 1;
  }
  for (const sub of (subs || []) as any[]) {
    const s = stats.get(sub.enrollment_id);
    if (s && sub.paysimple_payment_id) s.paid = true;
  }

  // Only a group where one row has class history or real money in it is
  // doing harm (reminders, auto-absents, "you missed" mail, a subscription
  // on the wrong row). Two free signups under two addresses are not, and on
  // 2026-09-19 they were 9 of the 11 groups: reporting them daily is noise.
  return groups
    .map((g) => ({
      cohortId: String(g.rows[0].cohort_id),
      name: String(g.rows[0].full_name || g.rows[0].email),
      matchedOn: g.matchedOn,
      rows: g.rows.map((r) => ({ id: r.id, email: r.email, ...stats.get(r.id)! })),
    }))
    .filter((g) => g.rows.some((r) => r.attended + r.autoAbsent > 0 || r.paid));
}
