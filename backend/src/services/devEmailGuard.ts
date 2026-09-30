/**
 * Environment guard: the dev backend must never mail a real person.
 *
 * Why this exists as CODE and not just a settings row. On 2026-08-13, while
 * root-causing the session-reminder incident, `accelerator-dev-backend` was
 * found running `NODE_ENV=production` with a live `MANDRILL_API_KEY`,
 * `SMTP_HOST=smtp.mandrillapp.com`, `EMAIL_FROM=info@colaberry.com` and
 * `ENABLE_AUTO_EMAIL=true`, starting the same schedulers as production against
 * `accelerator_dev1` — a database holding real names and real addresses. It had
 * not mis-sent anything found, but nothing structural stopped it: an email from
 * dev is byte-identical to one from prod, same branded sender, same domain.
 *
 * The immediate mitigation was `test_mode_enabled = true` on dev1, which makes
 * resolveEmailRecipient() redirect. That is one row in a table: a DB refresh
 * from a prod snapshot, a settings-screen edit, or a fresh dev database silently
 * removes it, and nothing warns anyone. This module is the backstop that cannot
 * be un-set from the database.
 *
 * The safety property, stated plainly: **when APP_ENV=dev, an address that is
 * not the configured sink cannot receive mail from this process** — it is either
 * rewritten to the sink or the send is blocked. Blocking is the deliberate
 * behavior when no sink is configured (fail closed): in a dev environment, not
 * sending is always recoverable, mailing a student is not.
 *
 * Pure decision function, no I/O and no clock, so the routing rules are testable
 * without SMTP, a database, or environment mutation. The caller supplies both
 * `devMode` and the resolved `sink`.
 */

export interface MailLike {
  to?: any;
  cc?: any;
  bcc?: any;
  subject?: string;
  [key: string]: any;
}

export interface DevGuardDecision {
  /** pass = send unchanged; redirect = send `options`; block = do not send. */
  action: 'pass' | 'redirect' | 'block';
  /** Present for 'redirect' — the rewritten options to hand to the transport. */
  options?: MailLike;
  /** Human-readable original recipient list, for the log line and subject tag. */
  originalRecipients: string;
}

/**
 * Flatten nodemailer's several accepted recipient shapes into plain addresses.
 * Accepts `"a@b.com"`, `"Name <a@b.com>"`, `{address}`, and arrays of any of
 * those, across to/cc/bcc — cc and bcc included deliberately, because a guard
 * that only rewrote `to` would still deliver every carbon copy to a real inbox.
 */
export function collectRecipients(options: MailLike): string[] {
  const out: string[] = [];
  for (const field of ['to', 'cc', 'bcc']) {
    const v = options[field];
    if (!v) continue;
    for (const entry of Array.isArray(v) ? v : [v]) {
      if (!entry) continue;
      if (typeof entry === 'string') {
        // "Name <a@b.com>" and bare "a@b.com", plus comma-joined strings.
        for (const part of entry.split(',')) {
          const trimmed = part.trim();
          if (trimmed) out.push(trimmed);
        }
      } else if (typeof entry === 'object' && entry.address) {
        out.push(String(entry.address).trim());
      }
    }
  }
  return out;
}

/** Bare address, lowercased — "Ada <A@B.com>" and "a@b.com" compare equal. */
function bareAddress(raw: string): string {
  const angled = raw.match(/<([^>]+)>/);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/**
 * Decide how an outbound message should be routed.
 *
 * `devMode` is passed in rather than read from process.env here so the rules can
 * be exercised directly, and so production behavior is a single explicit `false`
 * at the call site rather than an ambient global.
 */
export function decideDevEmailRouting(
  options: MailLike,
  sink: string | null,
  devMode: boolean
): DevGuardDecision {
  const recipients = collectRecipients(options);
  const originalRecipients = recipients.join(', ');

  // Production and any non-dev environment: never touch the message.
  if (!devMode) return { action: 'pass', originalRecipients };

  // Nothing addressed — let the transport raise its own error rather than
  // inventing a redirect for a message that was already malformed.
  if (recipients.length === 0) return { action: 'pass', originalRecipients };

  // Fail closed. No sink configured means dev has no safe destination, and the
  // only remaining options are "mail a real person" or "do not send".
  if (!sink || !sink.trim()) return { action: 'block', originalRecipients };

  const sinkAddr = bareAddress(sink);
  // Already safe — typically because resolveEmailRecipient's test-mode redirect
  // ran upstream. Pass through untouched so the subject is not double-tagged.
  if (recipients.every((rec) => bareAddress(rec) === sinkAddr)) {
    return { action: 'pass', originalRecipients };
  }

  return {
    action: 'redirect',
    originalRecipients,
    options: {
      ...options,
      to: sink,
      // Dropped, not rewritten: these would otherwise each be a live delivery.
      cc: undefined,
      bcc: undefined,
      subject: `[DEV → ${originalRecipients}] ${options.subject ?? ''}`.trim(),
    },
  };
}
