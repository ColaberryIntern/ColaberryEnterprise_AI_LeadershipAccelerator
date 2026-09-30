import {
  STUDENT_INTAKE_SOURCE,
  loadIntakeTruth,
  loadIntakeTruthAtRevision,
  saveCorrectedTruth,
  saveIntakeTruth,
} from '../intakeTruthStore';
import ProjectUnderstandingRecord from '../../../models/ProjectUnderstandingRecord';
import type { UnderstandingItem } from '../../delivery/projectUnderstanding';

jest.mock('../../../models/ProjectUnderstandingRecord', () => ({
  __esModule: true,
  default: { findOne: jest.fn(), create: jest.fn() },
}));

const model = ProjectUnderstandingRecord as unknown as {
  findOne: jest.Mock;
  create: jest.Mock;
};

const PROJECT = '6d10e2db-cd35-4825-93ce-2432c2fd2269';
const IDEA = 'A tool that checks incoming invoices against the purchase orders in our spreadsheet.';

const intake = {
  projectId: PROJECT,
  idea: IDEA,
  answers: [{
    id: 'guardrail',
    question: 'What would you check before it went out?',
    answer: 'Priya signs off anything over 5k.',
    angle: 'THE GUARDRAIL',
  }],
};

/** A row as Sequelize hands it back, with a spy on update. */
const row = (items: UnderstandingItem[]) => ({ items, update: jest.fn().mockResolvedValue(undefined) });

beforeEach(() => {
  model.findOne.mockReset();
  model.create.mockReset().mockResolvedValue(undefined);
});

describe('a student project needs no new column', () => {
  it('stores under (student_intake, projectId), leaving lead_id null', async () => {
    model.findOne.mockResolvedValue(null);
    await saveIntakeTruth(intake);

    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
      source: STUDENT_INTAKE_SOURCE,
      source_ref: PROJECT,
      lead_id: null,
      status: 'extracted',
    }));
  });

  it('looks the row up on the same unique key it wrote', async () => {
    // (source, source_ref) is UNIQUE, which is where the idempotency comes from.
    // Reading on any other key would find a different row, or none.
    model.findOne.mockResolvedValue(null);
    await loadIntakeTruth(PROJECT);
    expect(model.findOne).toHaveBeenCalledWith({
      where: { source: STUDENT_INTAKE_SOURCE, source_ref: PROJECT },
    });
  });

  it('writes the mapped items, every one of them quotable', async () => {
    model.findOne.mockResolvedValue(null);
    const result = await saveIntakeTruth(intake);

    expect(result.outcome).toBe('created');
    expect(result.items.map((i) => i.dimension)).toEqual(['problem', 'approval_points']);
    for (const item of result.items) {
      expect(item.classification).toBe('FACT');
      expect(item.source_quote).toBeTruthy();
    }
  });
});

describe('running the intake twice', () => {
  it('updates the one row rather than writing a second understanding', async () => {
    const existing = row([]);
    model.findOne.mockResolvedValue(existing);

    const result = await saveIntakeTruth(intake);
    expect(result.outcome).toBe('updated');
    expect(existing.update).toHaveBeenCalledTimes(1);
    expect(model.create).not.toHaveBeenCalled();
  });

  it('is a no-op when nothing changed', async () => {
    const first = await (async () => {
      model.findOne.mockResolvedValue(null);
      return saveIntakeTruth(intake);
    })();

    const existing = row([...first.items]);
    model.findOne.mockResolvedValue(existing);

    const again = await saveIntakeTruth(intake);
    expect(again.outcome).toBe('unchanged');
    expect(existing.update).not.toHaveBeenCalled();
  });

  it('treats a reordered extraction as unchanged, not as a rewrite', async () => {
    model.findOne.mockResolvedValue(null);
    const first = await saveIntakeTruth(intake);

    const existing = row([...first.items].reverse());
    model.findOne.mockResolvedValue(existing);

    expect((await saveIntakeTruth(intake)).outcome).toBe('unchanged');
    expect(existing.update).not.toHaveBeenCalled();
  });
});

describe('a human correction is never overwritten', () => {
  const corrected: UnderstandingItem = {
    dimension: 'approval_points',
    value: 'Priyanka signs off anything over 5k.',
    classification: 'FACT',
    provenance: 'client_confirmed',
    source_quote: 'Priyanka signs off anything over 5k.',
  };

  it('refuses the automatic write and names what it protected', async () => {
    const existing = row([corrected]);
    model.findOne.mockResolvedValue(existing);

    const result = await saveIntakeTruth(intake);

    expect(result.outcome).toBe('refused_confirmed');
    expect(result.confirmedItems).toEqual([corrected]);
    expect(existing.update).not.toHaveBeenCalled();
  });

  it('refuses the WHOLE write rather than merging around the corrected item', async () => {
    // Partially overwriting is how a student ends up with half a correction
    // intact and no way to tell which half.
    const existing = row([corrected]);
    model.findOne.mockResolvedValue(existing);

    const result = await saveIntakeTruth(intake);
    expect(result.items).toEqual([corrected]);
    expect(result.items).toHaveLength(1);
  });

  it('protects a pm confirmation too, not only the client\'s own', async () => {
    const existing = row([{ ...corrected, provenance: 'pm_confirmed' }]);
    model.findOne.mockResolvedValue(existing);
    expect((await saveIntakeTruth(intake)).outcome).toBe('refused_confirmed');
  });

  it('does not refuse over an ordinary extracted item', async () => {
    const existing = row([{ ...corrected, provenance: 'source_message' }]);
    model.findOne.mockResolvedValue(existing);
    expect((await saveIntakeTruth(intake)).outcome).toBe('updated');
  });
});

describe('reading it back', () => {
  it('returns null when the project has no understanding yet', async () => {
    model.findOne.mockResolvedValue(null);
    expect(await loadIntakeTruth(PROJECT)).toBeNull();
  });

  it('returns an empty list, not null, for a row with no items', async () => {
    // The difference matters: null means "never ran", empty means "ran and
    // found nothing quotable". A caller that conflates them cannot tell a
    // student who skipped every question from one who never started.
    model.findOne.mockResolvedValue(row([]));
    expect(await loadIntakeTruth(PROJECT)).toEqual([]);
  });
});

describe('the revision a plan is built from', () => {
  it('starts at 1, because an existing understanding was never revision zero', async () => {
    model.findOne.mockResolvedValue(null);
    const result = await saveIntakeTruth(intake);
    expect(result.revision).toBe(1);
    expect(model.create).toHaveBeenCalledWith(expect.objectContaining({ revision: 1 }));
  });

  it('increments when the facts actually change', async () => {
    const existing = { items: [], revision: 4, update: jest.fn().mockResolvedValue(undefined) };
    model.findOne.mockResolvedValue(existing);

    const result = await saveIntakeTruth(intake);
    expect(result.revision).toBe(5);
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({ revision: 5 }));
  });

  it('does NOT increment when nothing changed', async () => {
    // A routine re-sync must not look like an edit to whoever is deciding
    // whether a plan is stale.
    model.findOne.mockResolvedValue(null);
    const first = await saveIntakeTruth(intake);

    model.findOne.mockResolvedValue({
      items: [...first.items], revision: 7, update: jest.fn(),
    });
    expect((await saveIntakeTruth(intake)).revision).toBe(7);
  });

  it('does not move when a write is refused over a confirmed item', async () => {
    // A refused write changes nothing, so a plan built on revision 9 is still
    // built on the truth that is there.
    model.findOne.mockResolvedValue({
      items: [{
        dimension: 'approval_points',
        value: 'Priyanka signs off.',
        classification: 'FACT',
        provenance: 'client_confirmed',
        source_quote: 'Priyanka signs off.',
      }],
      revision: 9,
      update: jest.fn(),
    });
    const result = await saveIntakeTruth(intake);
    expect(result).toMatchObject({ outcome: 'refused_confirmed', revision: 9 });
  });

  it('a correction always makes a new revision, and stamps who looked', async () => {
    const existing = { items: [], revision: 2, update: jest.fn().mockResolvedValue(undefined) };
    model.findOne.mockResolvedValue(existing);

    const next = await saveCorrectedTruth(PROJECT, []);
    expect(next).toBe(3);
    expect(existing.update).toHaveBeenCalledWith(expect.objectContaining({
      revision: 3, confirmed_at: expect.any(Date),
    }));
  });

  it('reads the items and the revision together, for the plan generator', async () => {
    model.findOne.mockResolvedValue({ items: [], revision: 11 });
    expect(await loadIntakeTruthAtRevision(PROJECT)).toEqual({ items: [], revision: 11 });
  });

  it('treats a legacy row with no revision as revision 1, not zero', async () => {
    model.findOne.mockResolvedValue({ items: [], revision: undefined });
    expect((await loadIntakeTruthAtRevision(PROJECT))?.revision).toBe(1);
  });
});
