import { parseRemintArgs, REMINTABLE_SLUGS, REMINT_USAGE } from '../remintArgs';

/**
 * These arguments drive a DESTRUCTIVE half-operation: the room's existing link is
 * cleared before the new one is minted. Every case below is a way that could be
 * triggered by accident, so each is refused rather than half-performed.
 */
describe('parseRemintArgs', () => {
  const STANDUP = 'ai-internship-standup';
  const PUBLIC = 'colaberry-ai-sessions';

  const ok = (argv: string[]) => {
    const r = parseRemintArgs(argv);
    if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
    return r.args;
  };
  const err = (argv: string[]) => {
    const r = parseRemintArgs(argv);
    if (r.ok) throw new Error('expected a refusal');
    return r.error;
  };

  it('parses one pair', () => {
    expect(ok([`${STANDUP}=program.101@colaberry.com`])).toEqual({
      targets: [{ slug: STANDUP, hostEmail: 'program.101@colaberry.com' }],
      dryRun: false,
    });
  });

  it('parses both rooms and keeps the given order', () => {
    const args = ok([`${PUBLIC}=b@c.com`, `${STANDUP}=a@c.com`]);
    expect(args.targets.map((t) => t.slug)).toEqual([PUBLIC, STANDUP]);
  });

  it('reads --dry-run in any position', () => {
    expect(ok(['--dry-run', `${STANDUP}=a@c.com`]).dryRun).toBe(true);
    expect(ok([`${STANDUP}=a@c.com`, '--dry-run']).dryRun).toBe(true);
  });

  it('defaults to a REAL run, so a dry run has to be asked for', () => {
    expect(ok([`${STANDUP}=a@c.com`]).dryRun).toBe(false);
  });

  it('trims surrounding whitespace on both halves', () => {
    expect(ok([`  ${STANDUP} = a@c.com  `]).targets[0]).toEqual({ slug: STANDUP, hostEmail: 'a@c.com' });
  });

  it('ignores empty argv entries rather than failing on them', () => {
    expect(ok(['', `${STANDUP}=a@c.com`, '   ']).targets).toHaveLength(1);
  });

  describe('refusals', () => {
    it('refuses no pairs at all', () => {
      expect(err([])).toContain('no <slug>=<host-email> pair given');
      expect(err(['--dry-run'])).toContain('no <slug>=<host-email> pair given');
    });

    // A MISSPELLED FLAG MUST NOT BECOME A REAL RUN. This is the whole reason unknown
    // options are rejected instead of ignored.
    it('refuses a misspelled flag instead of silently doing it for real', () => {
      expect(err([`${STANDUP}=a@c.com`, '--dry-rn'])).toContain('unknown option: --dry-rn');
      expect(err([`${STANDUP}=a@c.com`, '-dry-run'])).toContain('unknown option: -dry-run');
      expect(err([`${STANDUP}=a@c.com`, '--force'])).toContain('unknown option: --force');
    });

    it('refuses --dry-run twice, because a repeated flag means the operator is unsure', () => {
      expect(err([`${STANDUP}=a@c.com`, '--dry-run', '--dry-run'])).toContain('--dry-run given twice');
    });

    it('refuses a token that is not a pair', () => {
      expect(err([STANDUP])).toContain('expected <slug>=<host-email>');
    });

    it('refuses a pair with either half missing', () => {
      expect(err([`${STANDUP}=`])).toContain('missing host email');
      expect(err(['=a@c.com'])).toContain('missing slug');
    });

    // A slug ensureInternshipMeetingRooms does not handle would have its link cleared
    // and never replaced, and its schedule never re-stamped.
    it('refuses a slug whose schedule would not be re-stamped', () => {
      expect(err(['mango-lounge=a@c.com'])).toContain('cannot re-mint slug "mango-lounge"');
      expect(err([`${STANDUP}x=a@c.com`])).toContain('cannot re-mint');
    });

    it('refuses a host that is not an address shape', () => {
      expect(err([`${STANDUP}=program.101`])).toContain('not a host email address');
      expect(err([`${STANDUP}=a b@c.com`])).toContain('not a host email address');
    });

    it('refuses the same slug twice', () => {
      expect(err([`${STANDUP}=a@c.com`, `${STANDUP}=b@c.com`])).toContain('slug given twice');
    });

    // THE BUG BEING FIXED, handed back as input. Two rooms on one host is exactly the
    // collision this script exists to end.
    it('refuses pointing both rooms at the same host', () => {
      expect(err([`${STANDUP}=a@c.com`, `${PUBLIC}=a@c.com`]))
        .toContain('both rooms point at the same host');
    });

    it('compares hosts case-insensitively when catching that collision', () => {
      expect(err([`${STANDUP}=A@C.com`, `${PUBLIC}=a@c.com`]))
        .toContain('both rooms point at the same host');
    });

    it('puts the usage text on every refusal', () => {
      expect(err([])).toContain(REMINT_USAGE);
      expect(err(['nope'])).toContain(REMINT_USAGE);
    });
  });

  it('names exactly the two rooms whose schedule can be re-stamped', () => {
    expect([...REMINTABLE_SLUGS].sort()).toEqual([STANDUP, PUBLIC].sort());
    expect(REMINT_USAGE).toContain(STANDUP);
    expect(REMINT_USAGE).toContain(PUBLIC);
  });
});
