/**
 * Utilities for cleaning the legacy CCPP `EventBrite_EventAttendees` data.
 *
 * That table's `AttendeeName` / `Email` values arrive wrapped in stray single
 * quotes and a trailing comma (e.g. the stored email literally reads `'a@b.com',`)
 * and rows are duplicated per order. Any code that turns those rows into accounts
 * MUST sanitize the strings and de-duplicate first.
 */

/** Strip wrapping quotes, commas, and whitespace from a legacy CCPP value. */
export function cleanEventbriteValue(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return '';
  return String(raw)
    .trim()
    .replace(/^['",\s]+/, '') // leading quotes / commas / whitespace
    .replace(/['",\s]+$/, '') // trailing quotes / commas / whitespace
    .trim();
}

export interface RawEventbriteAttendee {
  AttendeeName?: string | null;
  Email?: string | null;
  PhoneNumber?: string | null;
  OrderId?: number | string | null;
  CreatedDate?: Date | string | null;
}

export interface CleanAttendee {
  name: string;
  email: string;
  phone: string;
  order_id: string;
}

/**
 * Clean + de-duplicate raw attendee rows. Dedup key is `orderId + lowercased
 * cleaned email` (the two ways the legacy table duplicates a person). Rows
 * without a usable email are dropped.
 */
export function dedupeAttendees(rows: RawEventbriteAttendee[]): CleanAttendee[] {
  const byKey = new Map<string, CleanAttendee>();
  for (const r of rows) {
    const email = cleanEventbriteValue(r.Email).toLowerCase();
    if (!email || !email.includes('@')) continue;
    const order_id = cleanEventbriteValue(r.OrderId == null ? '' : String(r.OrderId));
    const key = `${order_id}|${email}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      name: cleanEventbriteValue(r.AttendeeName),
      email,
      phone: cleanEventbriteValue(r.PhoneNumber),
      order_id,
    });
  }
  return [...byKey.values()];
}
