/**
 * The dev-environment email guard.
 *
 * Context: on 2026-08-13 the dev backend was found running with live Mandrill
 * credentials, EMAIL_FROM=info@colaberry.com and the production schedulers, against
 * a database full of real student addresses. The first mitigation was a settings
 * row (test_mode_enabled) — one DB refresh away from silently disappearing. This
 * guard is the backstop that cannot be un-set from the database.
 *
 * The property under test, stated once: **in dev, an address that is not the
 * configured sink must not receive mail.** Every case below is an attempt to
 * violate that.
 */

import { decideDevEmailRouting, collectRecipients } from '../devEmailGuard';

const SINK = 'ali@colaberry.com';

describe('collectRecipients', () => {
  it('gathers to, cc and bcc together', () => {
    // cc/bcc are included deliberately — a guard that only saw `to` would still
    // deliver every carbon copy to a real inbox.
    expect(
      collectRecipients({ to: 'a@x.com', cc: 'b@x.com', bcc: ['c@x.com', 'd@x.com'] })
    ).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  });

  it('handles the shapes nodemailer actually accepts', () => {
    expect(collectRecipients({ to: 'Ada Lovelace <ada@x.com>' })).toEqual(['Ada Lovelace <ada@x.com>']);
    expect(collectRecipients({ to: { address: 'ada@x.com', name: 'Ada' } })).toEqual(['ada@x.com']);
    expect(collectRecipients({ to: 'a@x.com, b@x.com' })).toEqual(['a@x.com', 'b@x.com']);
    expect(collectRecipients({ to: undefined })).toEqual([]);
  });
});

describe('decideDevEmailRouting', () => {
  describe('production must be untouched', () => {
    it('passes every message through unchanged when devMode is false', () => {
      const opts = { to: 'student@gmail.com', cc: 'staff@x.com', subject: 'Session 7' };
      const d = decideDevEmailRouting(opts, null, false);
      expect(d.action).toBe('pass');
      expect(d.options).toBeUndefined();
    });

    it('passes through in prod even with no sink configured', () => {
      // The blocking behavior must be strictly dev-only. A guard that failed
      // closed in production would silently stop all transactional mail.
      expect(decideDevEmailRouting({ to: 'student@gmail.com' }, null, false).action).toBe('pass');
    });
  });

  describe('dev with a sink configured', () => {
    it('redirects a real recipient to the sink', () => {
      const d = decideDevEmailRouting(
        { to: 'student@gmail.com', subject: '[Accelerator] Today: Session 7' },
        SINK,
        true
      );
      expect(d.action).toBe('redirect');
      expect(d.options!.to).toBe(SINK);
      expect(d.options!.subject).toBe('[DEV → student@gmail.com] [Accelerator] Today: Session 7');
    });

    it('drops cc and bcc rather than rewriting them', () => {
      const d = decideDevEmailRouting(
        { to: 'student@gmail.com', cc: 'parent@gmail.com', bcc: 'boss@corp.com', subject: 'x' },
        SINK,
        true
      );
      expect(d.options!.cc).toBeUndefined();
      expect(d.options!.bcc).toBeUndefined();
      // The dropped addresses are still named in the subject, so a dev tester can
      // see who would have been copied in production.
      expect(d.options!.subject).toContain('parent@gmail.com');
      expect(d.options!.subject).toContain('boss@corp.com');
    });

    it('leaves an already-safe message alone instead of double-tagging it', () => {
      // resolveEmailRecipient's test-mode redirect usually ran upstream.
      const d = decideDevEmailRouting({ to: SINK, subject: '[TEST → s@x.com] hi' }, SINK, true);
      expect(d.action).toBe('pass');
    });

    it('compares bare addresses, not display names or casing', () => {
      expect(decideDevEmailRouting({ to: 'Ali <ALI@Colaberry.com>' }, SINK, true).action).toBe('pass');
    });

    it('redirects when even ONE of several recipients is unsafe', () => {
      // The dangerous case: a message mostly to the sink, with one real address
      // hidden in the list. "Every recipient is safe" is the only passing test.
      const d = decideDevEmailRouting({ to: [SINK, 'student@gmail.com'], subject: 'x' }, SINK, true);
      expect(d.action).toBe('redirect');
      expect(d.options!.to).toBe(SINK);
    });

    it('redirects when the sink is only in cc and a real address is in to', () => {
      const d = decideDevEmailRouting({ to: 'student@gmail.com', cc: SINK, subject: 'x' }, SINK, true);
      expect(d.action).toBe('redirect');
      expect(d.options!.cc).toBeUndefined();
    });

    it('preserves the rest of the message', () => {
      const d = decideDevEmailRouting(
        { to: 'student@gmail.com', subject: 's', html: '<p>body</p>', from: 'info@colaberry.com', headers: { 'X-Tag': 't' } },
        SINK,
        true
      );
      expect(d.options!.html).toBe('<p>body</p>');
      expect(d.options!.from).toBe('info@colaberry.com');
      expect(d.options!.headers).toEqual({ 'X-Tag': 't' });
    });
  });

  describe('dev with NO sink — must fail closed', () => {
    it('blocks rather than delivering when no sink is configured', () => {
      // Not sending in dev is recoverable. Mailing a student is not.
      expect(decideDevEmailRouting({ to: 'student@gmail.com' }, null, true).action).toBe('block');
      expect(decideDevEmailRouting({ to: 'student@gmail.com' }, '', true).action).toBe('block');
      expect(decideDevEmailRouting({ to: 'student@gmail.com' }, '   ', true).action).toBe('block');
    });

    it('names the intended recipients on the blocked decision, for the log line', () => {
      const d = decideDevEmailRouting({ to: 'a@x.com', cc: 'b@x.com' }, null, true);
      expect(d.originalRecipients).toBe('a@x.com, b@x.com');
    });
  });

  it('never lets a non-sink address survive in dev, across many shapes', () => {
    // The safety property as a single sweep. For each input, either the send is
    // blocked, or every surviving recipient is the sink.
    const shapes: any[] = [
      { to: 'student@gmail.com' },
      { to: ['a@x.com', 'b@y.com'] },
      { to: 'Name <real@person.com>' },
      { to: { address: 'real@person.com' } },
      { to: 'a@x.com, b@x.com' },
      { to: SINK, cc: 'sneaky@real.com' },
      { to: SINK, bcc: ['sneaky@real.com'] },
    ];
    for (const shape of shapes) {
      for (const sink of [SINK, null]) {
        const d = decideDevEmailRouting(shape, sink, true);
        if (d.action === 'block') continue;
        const survivors = collectRecipients(d.action === 'redirect' ? d.options! : shape);
        for (const s of survivors) {
          expect(s.toLowerCase()).toContain('ali@colaberry.com');
        }
      }
    }
  });
});
