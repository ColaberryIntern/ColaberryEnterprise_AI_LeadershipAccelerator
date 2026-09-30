/**
 * The three fields Story Format V1 made readable.
 *
 * `situation.constraints`, `situation.goals` and `architecture.dataStores` were
 * each authored on the snapshot type, populated by the pipeline, and — in the
 * case of the two situation lists — walked by the publish gate's claim scan, so
 * a sentence in either could BLOCK a record from publishing. None of the three
 * was ever projected onto the public payload. A constraint that can veto
 * publication and can never be read is the worst of both worlds; these
 * assertions are the proof it is closed.
 *
 * NO DATABASE, NO NETWORK, NO CLOCK. These are pure projectors.
 *
 * EVERY ASSERTION HERE WAS SEEN RED. Each block names the mutation that breaks
 * it, and each mutation was applied, watched fail, and reverted byte-exact.
 */

import { projectArchitecture, projectSituation } from '../caseStudyPublicSections';
import { internalSnapshotContent } from './publicFixtures';
import type { CaseStudySnapshotContent } from '../../../types/caseStudy';

const content = (over: Record<string, unknown> = {}): CaseStudySnapshotContent =>
  ({ ...internalSnapshotContent(), ...over } as CaseStudySnapshotContent);

const situationOf = (over: Record<string, unknown>): CaseStudySnapshotContent => {
  const base = internalSnapshotContent() as unknown as Record<string, unknown>;
  const situation = base.situation as Record<string, unknown>;
  return content({ situation: { ...situation, ...over } });
};

const architectureOf = (over: Record<string, unknown>): CaseStudySnapshotContent => {
  const base = internalSnapshotContent() as unknown as Record<string, unknown>;
  const architecture = base.architecture as Record<string, unknown>;
  return content({ architecture: { ...architecture, ...over } });
};

/* ------------------------------------------------------------------ situation --- */

describe('projectSituation carries the two lists that could always block a publish', () => {
  /**
   * MUTATION: delete `constraints: lines(s.constraints)` (or the `goals` line)
   * from `projectSituation` in `caseStudyPublicSections.ts`.
   */
  it('projects constraints and goals from the snapshot', () => {
    const projected = projectSituation(content());
    expect(projected).not.toBeNull();
    expect(projected?.constraints).toEqual(['No write access to the ERP.']);
    expect(projected?.goals).toEqual(['Cut manual reconciliation.']);
    // Non-vacuity: the fixture genuinely carries both, so neither assertion is
    // passing against an empty array that was never populated.
    const raw = internalSnapshotContent() as unknown as Record<string, unknown>;
    const rawSituation = raw.situation as Record<string, unknown>;
    expect((rawSituation.constraints as string[]).length).toBeGreaterThan(0);
    expect((rawSituation.goals as string[]).length).toBeGreaterThan(0);
  });

  it('emits empty arrays rather than undefined when the snapshot has neither', () => {
    // A renderer asks `length`. `undefined` would make every consumer guard for
    // a distinction the snapshot does not actually carry.
    const projected = projectSituation(situationOf({ constraints: undefined, goals: undefined }));
    expect(projected?.constraints).toEqual([]);
    expect(projected?.goals).toEqual([]);
  });

  it('drops blank and non-string entries rather than projecting holes', () => {
    const projected = projectSituation(situationOf({
      constraints: ['  ', '', 'Real constraint.', 42, null],
      goals: ['   Trimmed goal.   '],
    }));
    expect(projected?.constraints).toEqual(['Real constraint.']);
    expect(projected?.goals).toEqual(['Trimmed goal.']);
  });

  /**
   * THE NARRATIVE STILL DECIDES WHETHER THE BAND EXISTS. A band headed "The
   * situation" whose entire content is a bullet list of goals is not a
   * situation. Widening the guard to include the two lists would have been the
   * easy change and the wrong one.
   *
   * MUTATION: change the guard to
   * `if (!body.length && !lines(s.constraints).length && !lines(s.goals).length) return null;`
   */
  it('still returns null when the narrative is empty, however full the lists are', () => {
    const projected = projectSituation(situationOf({
      narrative: [],
      constraints: ['No write access to the ERP.'],
      goals: ['Cut manual reconciliation.'],
    }));
    expect(projected).toBeNull();
  });

  /**
   * THE VERIFICATION GATE STAYS AHEAD OF EVERYTHING. The two new lists are not a
   * side door around it.
   *
   * MUTATION: remove `|| !pairOf(s.verification)` from the guard.
   */
  it('fails closed on an unreadable verification pair, taking both lists with it', () => {
    expect(projectSituation(situationOf({ verification: undefined }))).toBeNull();
    expect(projectSituation(situationOf({ verification: { class: 'nonsense' } }))).toBeNull();
    // Non-vacuity: the unmodified fixture DOES project, so this is not passing
    // because the projector returns null for everything.
    expect(projectSituation(content())).not.toBeNull();
  });
});

/* --------------------------------------------------------------- architecture --- */

describe('projectArchitecture carries the data stores it was already assembling', () => {
  /**
   * MUTATION: remove `dataStores` from the returned object literal in
   * `projectArchitecture`.
   */
  it('projects data stores from the snapshot', () => {
    expect(projectArchitecture(content())?.dataStores).toEqual(['postgres']);
  });

  it('normalises them the same way as the three lists beside them', () => {
    // Same helper as stack, capabilities and integrations, so "PostgreSQL" and
    // "postgresql" cannot both appear and ask a reader to work out whether they
    // are two systems.
    const projected = projectArchitecture(architectureOf({
      dataStores: ['PostgreSQL', 'postgresql', '  ', 'Chroma'],
    }));
    expect(projected?.dataStores).not.toContain('  ');
    expect(new Set(projected?.dataStores).size).toBe(projected?.dataStores.length);
  });

  it('emits an empty array when the snapshot has none', () => {
    expect(projectArchitecture(architectureOf({ dataStores: undefined }))?.dataStores).toEqual([]);
  });

  /**
   * THE EMPTINESS TEST MUST AGREE WITH THE SNAPSHOT BUILDER, which already
   * counts data stores when deciding whether an architecture section exists at
   * all (`caseStudySnapshotSections.ts:168`). Before this, a repository that
   * evidenced a database and nothing else produced a section there and a `null`
   * here — the section existed and could never be read.
   *
   * MUTATION: remove `&& !dataStores.length` from the emptiness check.
   */
  it('treats a record with only data stores as having an architecture', () => {
    const only = architectureOf({
      narrative: undefined,
      stack: [],
      capabilities: [],
      integrations: undefined,
      dataStores: ['postgres'],
      diagram: undefined,
      diagramSource: undefined,
    });
    expect(projectArchitecture(only)).not.toBeNull();
    expect(projectArchitecture(only)?.dataStores).toEqual(['postgres']);

    // Non-vacuity: with the data stores removed the same record projects to
    // null, so the assertion above is not passing unconditionally.
    const none = architectureOf({
      narrative: undefined,
      stack: [],
      capabilities: [],
      integrations: undefined,
      dataStores: [],
      diagram: undefined,
      diagramSource: undefined,
    });
    expect(projectArchitecture(none)).toBeNull();
  });
});
