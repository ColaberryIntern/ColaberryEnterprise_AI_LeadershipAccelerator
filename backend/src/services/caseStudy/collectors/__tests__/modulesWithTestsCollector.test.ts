import { modulesWithTestsCollector } from '../modulesWithTests';
import { SMALL_SERVICE, treeInput } from './fixtureTree';

describe('modules_with_tests collector', () => {
  it('produces the ratio that used to be typed as the string "4 of 7"', () => {
    const result = modulesWithTestsCollector.collect(treeInput(SMALL_SERVICE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const payload = result.output.payload;
    expect(payload.shape).toBe('ratio');
    if (payload.shape !== 'ratio') return;
    // index.ts is a barrel and is not a module anyone tests directly.
    expect(payload.denominator).toBe(4);
    expect(payload.numerator).toBe(2);
    expect(result.output.valueDisplay).toBe('2 of 4');
  });

  it('names which modules are bare, untested ones first', () => {
    const result = modulesWithTestsCollector.collect(treeInput(SMALL_SERVICE));
    if (!result.ok) throw new Error('expected a figure');
    const payload = result.output.payload;
    if (payload.shape !== 'ratio') throw new Error('expected a ratio');

    // The useful half of this figure is what is MISSING, so a reader who stops
    // after two members has seen the two gaps rather than two reassurances.
    expect(payload.members?.slice(0, 2)).toEqual([
      { name: 'src/demoUnsafeAction.ts', status: 'no' },
      { name: 'src/transportSelector.ts', status: 'no' },
    ]);
    expect(payload.members?.filter((m) => m.status === 'yes').map((m) => m.name)).toEqual([
      'src/abacEvaluator.ts',
      'src/auditLog.ts',
    ]);
  });

  it('admits that pairing is by filename and proves nothing about assertions', () => {
    const result = modulesWithTestsCollector.collect(treeInput(SMALL_SERVICE));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.limitations[0]).toContain('by filename');
  });

  it('declines a tree with tests but no modules to attribute them to', () => {
    const result = modulesWithTestsCollector.collect(treeInput(['src/__tests__/orphan.test.ts']));
    expect(result).toMatchObject({ ok: false, reason: 'no_modules' });
  });

  it('refuses a truncated tree', () => {
    expect(modulesWithTestsCollector.collect(treeInput(SMALL_SERVICE, true)))
      .toMatchObject({ ok: false, reason: 'tree_truncated' });
  });
});
