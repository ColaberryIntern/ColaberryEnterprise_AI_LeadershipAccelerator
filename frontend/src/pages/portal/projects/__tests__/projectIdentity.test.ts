import { isUuid, adoptServerIds, ProjectIdentity } from '../projectIdentity';

const UUID_A = '3f1c9d2e-5b8a-4c17-9e04-8a7b6c5d4e3f';
const UUID_B = '11111111-2222-4333-8444-555555555555';

const proj = (o: Partial<ProjectIdentity> & Pick<ProjectIdentity, 'id'>): ProjectIdentity => ({ ...o });

describe('isUuid', () => {
  it('accepts a canonical v4 UUID', () => {
    expect(isUuid(UUID_A)).toBe(true);
  });

  it('rejects the browser pseudo id the store mints', () => {
    expect(isUuid('p1755012345678')).toBe(false);
  });

  it('rejects the seeded demo id and empty input', () => {
    expect(isUuid('sample-salon')).toBe(false);
    expect(isUuid('')).toBe(false);
  });
});

describe('adoptServerIds', () => {
  it('re-keys a claimed project from its pseudo id to the server UUID', () => {
    const { list, remapped } = adoptServerIds([
      proj({ id: 'p1755012345678', pipelineProjectId: UUID_A }),
    ]);
    expect(list[0].id).toBe(UUID_A);
    expect(remapped).toEqual([{ from: 'p1755012345678', to: UUID_A }]);
  });

  it('records the pseudo id as a legacy alias so bookmarked URLs still resolve', () => {
    const { list } = adoptServerIds([proj({ id: 'p1755012345678', pipelineProjectId: UUID_A })]);
    expect(list[0].legacyIds).toEqual(['p1755012345678']);
  });

  it('is idempotent — a second pass changes nothing and reports no remap', () => {
    const once = adoptServerIds([proj({ id: 'p1', pipelineProjectId: UUID_A })]);
    const twice = adoptServerIds(once.list);
    expect(twice.remapped).toEqual([]);
    expect(twice.list[0].id).toBe(UUID_A);
    expect(twice.list[0].legacyIds).toEqual(['p1']);
  });

  it('leaves the seeded demo alone (it is deliberately browser-only)', () => {
    const { list, remapped } = adoptServerIds([
      proj({ id: 'sample-salon', sample: true, pipelineProjectId: UUID_A }),
    ]);
    expect(list[0].id).toBe('sample-salon');
    expect(remapped).toEqual([]);
  });

  it('leaves a purely local build alone — there is no server id to adopt', () => {
    const { list, remapped } = adoptServerIds([proj({ id: 'p1755012345678' })]);
    expect(list[0].id).toBe('p1755012345678');
    expect(remapped).toEqual([]);
  });

  it('ignores a claim that is not a UUID rather than adopting junk', () => {
    const { list, remapped } = adoptServerIds([proj({ id: 'p1', pipelineProjectId: 'not-a-uuid' })]);
    expect(list[0].id).toBe('p1');
    expect(remapped).toEqual([]);
  });

  it('collapses a duplicate onto the row already keyed by the server id', () => {
    const { list } = adoptServerIds([
      proj({ id: UUID_A }),
      proj({ id: 'p1755012345678', pipelineProjectId: UUID_A }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(UUID_A);
    expect(list[0].legacyIds).toEqual(['p1755012345678']);
  });

  /**
   * The same collapse, in the order it actually happens.
   *
   * `createProjectFromAnswers` UNSHIFTS the new placeholder, so when
   * `claimBackendProject` runs the placeholder is at index 0 and the row already
   * keyed by the server id is behind it. The old code indexed the placeholder
   * first and then hit `continue` on the real row — dropping it, and with it the
   * student's lists, completions and command-centre URL. The doc comment
   * promised "the server-keyed row wins"; it only did when that row happened to
   * come first.
   */
  it('keeps the server-keyed row when the placeholder is visited first', () => {
    const { list } = adoptServerIds([
      proj({ id: 'p1755012345678', pipelineProjectId: UUID_A }),
      proj({ id: UUID_A, name: 'CoreOps', lists: ['r0', 'r1'] } as Partial<ProjectIdentity> & { id: string }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(UUID_A);
    // The real row's content survived rather than the empty placeholder's.
    expect(list[0].name).toBe('CoreOps');
    expect(list[0].lists).toEqual(['r0', 'r1']);
    // and the placeholder's old id still resolves.
    expect(list[0].legacyIds).toEqual(['p1755012345678']);
  });

  it('is order-independent: both arrangements yield the same surviving row', () => {
    const placeholder = proj({ id: 'p1755012345678', pipelineProjectId: UUID_A });
    const server = proj({ id: UUID_A, name: 'CoreOps' } as Partial<ProjectIdentity> & { id: string });

    const placeholderFirst = adoptServerIds([placeholder, server]).list;
    const serverFirst = adoptServerIds([server, placeholder]).list;

    expect(placeholderFirst).toHaveLength(1);
    expect(serverFirst).toHaveLength(1);
    expect(placeholderFirst[0].name).toBe(serverFirst[0].name);
    expect(placeholderFirst[0].id).toBe(serverFirst[0].id);
    expect(placeholderFirst[0].legacyIds).toEqual(serverFirst[0].legacyIds);
  });

  it('heals several stale projects in one pass', () => {
    const { list, remapped } = adoptServerIds([
      proj({ id: 'pA', pipelineProjectId: UUID_A }),
      proj({ id: 'sample-salon', sample: true }),
      proj({ id: 'pB', pipelineProjectId: UUID_B }),
    ]);
    expect(list.map((p) => p.id)).toEqual([UUID_A, 'sample-salon', UUID_B]);
    expect(remapped).toEqual([{ from: 'pA', to: UUID_A }, { from: 'pB', to: UUID_B }]);
  });

  it('does not mutate the input list', () => {
    const input = [proj({ id: 'p1', pipelineProjectId: UUID_A })];
    adoptServerIds(input);
    expect(input[0].id).toBe('p1');
  });
});
