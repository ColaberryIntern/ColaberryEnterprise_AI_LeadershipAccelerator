/**
 * Collapses enrollment/subscription rows that likely belong to the same real
 * person despite different-looking emails. Gmail (and its googlemail.com alias)
 * ignores dots in the local part and treats "+tag" as an alias of the base
 * inbox — a real, platform-guaranteed behavior, confirmed against production
 * data 2026-07-31 (Tanmayi Katamaraja: 3 active enrollment rows, one plain
 * address, two "+N" variants, same phone number). Every other domain is only
 * lowercased + trimmed — this must NEVER collapse an `@colaberry.com`
 * "+N" address, which staffDetection.ts already treats as a deliberately
 * distinct test persona, not an alias of the real account.
 */
export function emailIdentityKey(rawEmail: string | null | undefined): string {
  const email = (rawEmail || '').toLowerCase().trim();
  const at = email.indexOf('@');
  if (at < 0) return email;
  const domain = email.slice(at + 1);
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    const local = email.slice(0, at).split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return email;
}

/** The minimal signal set needed to rank duplicate rows for the same identity
 *  when only one can be shown. Preference order: an active subscription beats
 *  none; paid beats unpaid; a real member beats a still-Explorer row; the
 *  EARLIEST signup beats a later re-signup (the original account, not a
 *  duplicate created afterward). */
export interface DedupeSignal {
  email: string | null | undefined;
  hasActiveSubscription: boolean;
  paymentStatusPaid: boolean;
  isExplorer: boolean;
  createdAt: string | null | undefined;
}

function isBetter(a: DedupeSignal, b: DedupeSignal): boolean {
  if (a.hasActiveSubscription !== b.hasActiveSubscription) return a.hasActiveSubscription;
  if (a.paymentStatusPaid !== b.paymentStatusPaid) return a.paymentStatusPaid;
  if (a.isExplorer !== b.isExplorer) return !a.isExplorer;
  const at = a.createdAt ? new Date(a.createdAt).getTime() : Infinity;
  const bt = b.createdAt ? new Date(b.createdAt).getTime() : Infinity;
  return at < bt;
}

/** Keeps one row per identity key (see emailIdentityKey). Rows with no email
 *  never collapse with each other — each gets its own unique bucket. */
export function pickBestDuplicate<T>(rows: T[], toSignal: (row: T) => DedupeSignal): T[] {
  const bestByKey = new Map<string, { row: T; signal: DedupeSignal }>();
  const noEmailRows: T[] = [];
  rows.forEach((row) => {
    const signal = toSignal(row);
    const key = emailIdentityKey(signal.email);
    if (!key) { noEmailRows.push(row); return; }
    const existing = bestByKey.get(key);
    if (!existing || isBetter(signal, existing.signal)) bestByKey.set(key, { row, signal });
  });
  return [...[...bestByKey.values()].map((v) => v.row), ...noEmailRows];
}
