import { parseArgs } from '../convertLeadToClient';

/**
 * Argument handling for the conversion operator script.
 *
 * Worth pinning because of what the flags gate. `--commit` is the only thing standing
 * between a preview and five rows written against production, and `--lead` is an integer
 * used directly as a foreign key. A silent coercion of either - `--lead abc` becoming
 * `NaN`, or a typo'd `--commmit` reading as false - is a bad failure in one direction and
 * a very bad one in the other.
 */
describe('parseArgs', () => {
  it('reads a full invocation', () => {
    const args = parseArgs([
      '--lead', '412', '--brand', 'ai-flotation',
      '--engagement', 'Northgate 2027', '--project', 'Arrivals board', '--commit',
    ]);
    expect(args).toEqual({
      leadId: 412,
      brandSlug: 'ai-flotation',
      tenantSlug: undefined,
      engagementName: 'Northgate 2027',
      projectName: 'Arrivals board',
      commit: true,
    });
  });

  it('defaults to a dry run', () => {
    // The important default. Everything else can be wrong and recoverable; writing to
    // production because a flag was assumed true is not.
    expect(parseArgs(['--lead', '1']).commit).toBe(false);
  });

  it('only commits on the exact flag', () => {
    expect(parseArgs(['--lead', '1', '--commmit']).commit).toBe(false);
    expect(parseArgs(['--lead', '1', '--COMMIT']).commit).toBe(false);
  });

  it('refuses a lead id that is not an integer', () => {
    // leads.id is an autoincrement integer used as a foreign key. NaN would reach the
    // database as a lookup that quietly finds nothing.
    expect(() => parseArgs(['--lead', 'abc'])).toThrow(/must be an integer/);
    expect(() => parseArgs(['--lead', '4.5'])).toThrow(/must be an integer/);
  });

  it('refuses a missing lead id', () => {
    expect(() => parseArgs([])).toThrow(/--lead <id> is required/);
    expect(() => parseArgs(['--brand', 'ai-flotation'])).toThrow(/--lead <id> is required/);
  });

  it('leaves the tenant unset when only a brand is given', () => {
    // Not a gap: the brand carries its tenant, and the script resolves it from the row
    // rather than making the operator repeat it.
    const args = parseArgs(['--lead', '9', '--brand', 'ai-flotation']);
    expect(args.tenantSlug).toBeUndefined();
    expect(args.brandSlug).toBe('ai-flotation');
  });
});
