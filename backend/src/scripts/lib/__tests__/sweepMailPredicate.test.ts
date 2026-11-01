const { selectMessage, bareAddress, PROGRAMME_SENDERS } = require('../agentRoster');

/**
 * AF10.8 — the sweep's selection predicate.
 *
 * ## The defect
 *
 * `sweepInternMail.js` selected `lower(from_address) = ANY($builders)`: FROM only, and the seven
 * builders only. So the rule the job exists to serve — *"if he is sending and they are copied
 * and vice versa then you should be pulling them in"* — was half implemented. Builder-to-anyone
 * was caught; **Kes-to-Ali-with-a-builder-copied was not a candidate in any window, over any
 * range, ever.**
 *
 * Eight of Kes's messages about Ellis had never been filed and never could be, including the
 * agent's BRD and handover roadmap. Measured in production on 2026-11-01 over 90 days: 87
 * messages were selectable and **114 had a builder only in TO or CC**.
 *
 * ## Why this suite is the deliverable and not the diff
 *
 * The ticket's own success metric says it: *"a predicate change that no test can distinguish
 * from the old one is not a change anybody can trust."* Widening a filter is easy to do and
 * almost impossible to eyeball, because the symptom of getting it wrong is mail appearing on
 * somebody's ticket weeks later. So both directions are pinned — what must now be selected, and
 * what must still be refused.
 */

const BUILDERS = [
  'qninying@gmail.com', 'mihret@example.com', 'vessette@example.com',
  'kalkidan@example.com', 'tash.diah@gmail.com', 'rtkumera@example.com',
  'sarbjitsaini83@yahoo.com',
];
const scope = { builderEmails: BUILDERS };

describe('bareAddress', () => {
  it('reads a plain address', () => {
    expect(bareAddress('Kes@Colaberry.com')).toBe('kes@colaberry.com');
  });

  it('reads the address out of a display-name form, which is the schema trap', () => {
    // Some rows store `Display Name <a@b.com>`. Equality matching silently misses these, and
    // bare containment would match `fakekes@colaberry.com` for `kes@colaberry.com`.
    expect(bareAddress('Kesete Ghebremedhin <kes@colaberry.com>')).toBe('kes@colaberry.com');
  });

  it('THE REAL SHAPE: reads the object form the column actually stores', () => {
    // Measured in production 2026-11-01. The first dry run of this change read every recipient
    // as "[object Object]" and reported "no builder in to or cc" for the exact eight messages
    // the ticket exists to catch, while the SQL had correctly selected them as candidates.
    expect(bareAddress({ name: 'Ali Muwwakkil', address: 'ali@colaberry.com' }))
      .toBe('ali@colaberry.com');
    expect(bareAddress({ name: '', address: 'qninying@gmail.com' })).toBe('qninying@gmail.com');
  });

  it('survives null, undefined, whitespace and a shapeless object rather than throwing', () => {
    expect(bareAddress(null)).toBe('');
    expect(bareAddress(undefined)).toBe('');
    expect(bareAddress('   ')).toBe('');
    expect(bareAddress({})).toBe('');
    expect(bareAddress({ name: 'No Address Here' })).toBe('');
  });
});

describe('selectMessage — what must now be selected', () => {
  it('THE BUG: Kes to Ali with a builder copied is selected, and routed to the BUILDER', () => {
    const r = selectMessage({
      from: 'kes@colaberry.com',
      to: ['ali@colaberry.com'],
      cc: ['qninying@gmail.com'],
    }, scope);
    expect(r.selected).toBe(true);
    // Routing by sender would file this to a Kes ticket that does not exist.
    expect(r.owner).toBe('qninying@gmail.com');
    expect(r.via).toBe('recipient');
  });

  it('still selects a builder\'s own outbound mail, so widening did not regress the old rule', () => {
    const r = selectMessage({ from: 'tash.diah@gmail.com', to: ['anyone@example.com'] }, scope);
    expect(r.selected).toBe(true);
    expect(r.owner).toBe('tash.diah@gmail.com');
    expect(r.via).toBe('sender');
  });

  it('selects when the builder is in TO rather than CC', () => {
    const r = selectMessage({
      from: 'dhee@colaberry.com', to: ['tash.diah@gmail.com'], cc: [],
    }, scope);
    expect(r.selected).toBe(true);
    expect(r.owner).toBe('tash.diah@gmail.com');
  });

  it('matches through a display name, not just a bare address', () => {
    const r = selectMessage({
      from: 'Kesete <kes@colaberry.com>',
      cc: ['Quincy Nkwain Ninying <qninying@gmail.com>'],
    }, scope);
    expect(r.selected).toBe(true);
    expect(r.owner).toBe('qninying@gmail.com');
  });

  it('THE PRODUCTION ROW: the Ellis BRD message, in the exact shape the column stores', () => {
    // Verbatim from inbox_emails on 2026-11-01. This is one of the eight that had never been
    // filed and never could be: "Re: Platform Reliability Agent: BRD and Handover Roadmap".
    const r = selectMessage({
      from: 'kes@colaberry.com',
      to: [{ name: 'Ali Muwwakkil', address: 'ali@colaberry.com' }] as any,
      cc: [{ name: '', address: 'qninying@gmail.com' }] as any,
    }, scope);
    expect(r.selected).toBe(true);
    expect(r.owner).toBe('qninying@gmail.com');
    expect(r.via).toBe('recipient');
  });
});

describe('selectMessage — what must still be refused', () => {
  it('THE OVER-WIDENING: a PaySimple receipt to a builder is NOT selected', () => {
    // "Anyone who copied a builder" would file payment receipts onto agent tickets.
    const r = selectMessage({
      from: 'paysimple@colaberry.com', to: ['tash.diah@gmail.com'],
    }, scope);
    expect(r.selected).toBe(false);
    expect(r.reason).toMatch(/not a programme sender/);
  });

  it.each(['jackie@colaberry.com', 'cora@colaberry.com', 'ali@colaberry.com'])(
    'refuses %s even with a builder copied, because each was excluded on purpose',
    (from) => {
      expect(selectMessage({ from, cc: ['qninying@gmail.com'] }, scope).selected).toBe(false);
    },
  );

  it('refuses a programme sender when NO builder is involved at all', () => {
    const r = selectMessage({
      from: 'kes@colaberry.com', to: ['ali@colaberry.com'], cc: ['reese@colaberry.com'],
    }, scope);
    expect(r.selected).toBe(false);
    expect(r.reason).toMatch(/no builder in from, to or cc/);
  });

  it('does not let a lookalike address pass as a builder', () => {
    // Containment matching would accept this. The address is parsed and compared whole.
    const r = selectMessage({
      from: 'kes@colaberry.com', cc: ['notqninying@gmail.com'],
    }, scope);
    expect(r.selected).toBe(false);
  });

  it('handles a message with no recipients at all', () => {
    expect(selectMessage({ from: 'kes@colaberry.com' }, scope).selected).toBe(false);
  });
});

describe('selectMessage — the cases that need saying out loud', () => {
  it('reports ambiguity instead of silently picking, when two builders are copied', () => {
    const r = selectMessage({
      from: 'kes@colaberry.com',
      cc: ['qninying@gmail.com', 'tash.diah@gmail.com'],
    }, scope);
    expect(r.selected).toBe(true);
    expect(r.via).toBe('recipient-ambiguous');
    expect(r.owner).toBe('qninying@gmail.com');
    expect(r.otherBuilders).toEqual(['tash.diah@gmail.com']);
  });

  it('the allowlist is overridable, so the scope call is data and not a redeploy', () => {
    const r = selectMessage(
      { from: 'jackie@colaberry.com', cc: ['qninying@gmail.com'] },
      { builderEmails: BUILDERS, programmeSenders: ['jackie@colaberry.com'] },
    );
    expect(r.selected).toBe(true);
  });

  it('the shipped allowlist is exactly the three proposed, and excludes Ali', () => {
    expect([...PROGRAMME_SENDERS].sort()).toEqual([
      'aleem@colaberry.com', 'dhee@colaberry.com', 'kes@colaberry.com',
    ]);
    expect(PROGRAMME_SENDERS).not.toContain('ali@colaberry.com');
  });

  /**
   * CONTROL. Every "is selected" test above would also pass if the predicate simply returned
   * true, and every "is refused" test would pass if it returned false. This asserts the two
   * halves genuinely disagree on the same scope, so a predicate that collapsed to a constant
   * fails here rather than going green.
   */
  it('CONTROL: the predicate discriminates rather than answering the same way twice', () => {
    const yes = selectMessage({ from: 'kes@colaberry.com', cc: ['qninying@gmail.com'] }, scope);
    const no = selectMessage({ from: 'paysimple@colaberry.com', cc: ['qninying@gmail.com'] }, scope);
    expect(yes.selected).toBe(true);
    expect(no.selected).toBe(false);
  });
});
