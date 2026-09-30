import { decisionRecordsCollector } from '../decisionRecords';
import { SMALL_SERVICE, treeInput } from './fixtureTree';

describe('decision_records collector', () => {
  it('counts the records and names them, so the count is not taken on faith', () => {
    const result = decisionRecordsCollector.collect(treeInput(SMALL_SERVICE));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // The README inside docs/decisions is an index of the records, not a record.
    expect(result.output.payload).toEqual({
      shape: 'count',
      value: 2,
      members: [
        { name: 'Pin the sha' },
        { name: 'Refuse to guess a figure' },
      ],
    });
    expect(result.output.valueDisplay).toBe('2');
    expect(result.output.unit).toBe('records');
  });

  it('finds records in the other places teams keep them', () => {
    const result = decisionRecordsCollector.collect(treeInput([
      'adr/0001-choose-postgres.md',
      'docs/architecture/decisions/0002-drop-the-queue.md',
      'ADR-0003-single-writer.md',
      'docs/guide.md',
    ]));
    if (!result.ok) throw new Error('expected a figure');
    const payload = result.output.payload;
    expect(payload.shape === 'count' && payload.value).toBe(3);
  });

  it('creates NO metric for a repository with no records, rather than a metric of zero', () => {
    // Zero would render as a claim about how the team worked. Silence is the
    // truth: this repository does not answer the question.
    const result = decisionRecordsCollector.collect(treeInput(['src/index.ts', 'README.md']));
    expect(result).toMatchObject({ ok: false, reason: 'no_decision_records' });
  });

  it('says a written decision is not a followed decision', () => {
    const result = decisionRecordsCollector.collect(treeInput(SMALL_SERVICE));
    if (!result.ok) throw new Error('expected a figure');
    expect(result.output.limitations[0]).toContain('not a correct decision');
  });

  it('caps the named members and says it capped them', () => {
    const many = Array.from({ length: 30 }, (_, i) => 'docs/decisions/' + String(i).padStart(4, '0') + '-choice-' + i + '.md');
    const result = decisionRecordsCollector.collect(treeInput(many));
    if (!result.ok) throw new Error('expected a figure');
    const payload = result.output.payload;
    expect(payload.shape === 'count' && payload.value).toBe(30);
    expect(payload.shape === 'count' && payload.members?.length).toBe(24);
    expect(result.output.limitations.join(' ')).toContain('first 24 of 30');
  });
});
