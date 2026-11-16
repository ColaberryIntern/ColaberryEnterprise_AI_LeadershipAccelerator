import { analysisFromSnapshot } from '../serviceGapSnapshotText';
import { evidenceText, thinEvidence } from '../serviceGapRetrieval';
import { ev } from './serviceGapFixtures';

// Shape copied from a real production snapshot (identity / situation / taxonomy / decisions / closing / builder).
const SNAPSHOT = {
  identity: {
    title: 'The Question Was in Plain English. The Query Still Had to Be Safe.',
    summary: 'Natural-language questions over SQL Server and spreadsheet data, with every generated query validated against the retrieved schema before it runs.',
    standfirst: 'A learner built a plain-English question tool for SQL Server in which the model only ever proposes a query.',
    heroImageUrl: 'https://example.invalid/thumb.jpg',
  },
  situation: {
    narrative: ['Important business answers often sit in a database that only someone who writes SQL can reach.', 'The people this is for are business leaders who do not write SQL.', 'A third paragraph that is not needed.'],
    goals: ['Give a non-technical user a current answer from a live database.', 'Ask when a question is ambiguous.'],
    verification: { class: 'verified', method: 'repo', evidenceId: 'ad95ec6f-5f89-413d-9ff2-df3175f7eb26' },
  },
  taxonomy: {
    stack: ['Python 3.12', 'FastAPI', 'sqlglot'],
    capabilities: ['Deterministic validation of generated SQL before execution', 'Read-only execution with row and time caps'],
    deliverables: ['A local web application with sign-in', 'Exports to CSV, Excel and PDF'],
  },
  decisions: [
    { title: 'The model writes a candidate, not a query that runs', decision: 'Every candidate is parsed into a syntax tree and checked with no model involved.', evidence: 'The validator module.' },
  ],
  closing: 'The model may suggest a query, and only code with no model in it may let one run.',
  builder: { displayName: 'Private Person', intro: ['Private Person built this.'] },
  measurement: { metrics: [{ label: 'Backend tests defined', payload: { value: 6136 } }] },
};

describe('analysisFromSnapshot', () => {
  it('maps the story sections onto the detector analysis shape', () => {
    const a = analysisFromSnapshot(SNAPSHOT)!;
    expect(a.summary).toContain('plain-English question tool');
    expect(a.summary).toContain('validated against the retrieved schema');
    expect(a.problem).toContain('only someone who writes SQL');
    expect(a.problem).toContain('Goals: Give a non-technical user');
    expect(a.problem).not.toContain('third paragraph');
    expect(a.approach).toContain('The model writes a candidate, not a query that runs: Every candidate is parsed');
    expect(a.approach).toContain('Delivered: A local web application with sign-in; Exports to CSV, Excel and PDF.');
    expect(a.approach).toContain('only code with no model');
    expect(a.capabilities).toEqual(SNAPSHOT.taxonomy.capabilities);
    expect(a.techStack).toEqual(['Python 3.12', 'FastAPI', 'sqlglot']);
  });

  it('never promotes goals or metrics to claimed outcomes, and leaves out people, ids and urls', () => {
    const a = analysisFromSnapshot(SNAPSHOT)!;
    expect(a.outcomes).toEqual([]);
    const all = JSON.stringify(a);
    for (const s of ['Private Person', 'ad95ec6f', 'https://', '6136']) expect(all).not.toContain(s);
  });

  it('an inside case study with an empty summary column is no longer "thin" once its snapshot is read (the prod bug)', () => {
    const bare = ev({ sourceKind: 'inside', canonicalSummary: null, analysis: null });
    expect(thinEvidence(bare)?.reasonCode).toBe('thin_source');
    const withSnapshot = ev({ sourceKind: 'inside', canonicalSummary: null, analysis: analysisFromSnapshot(SNAPSHOT) });
    expect(thinEvidence(withSnapshot)).toBeNull();
    expect(evidenceText(withSnapshot)).toContain('Capabilities shown: Deterministic validation');
  });

  it('returns null for empty or malformed content, and clips oversized sections', () => {
    for (const c of [null, undefined, 'text', [], {}, { identity: {} }]) expect(analysisFromSnapshot(c)).toBeNull();
    const huge = analysisFromSnapshot({ identity: { summary: 'x'.repeat(50_000) }, closing: 'y'.repeat(50_000), decisions: Array(50).fill({ title: 't', decision: 'd'.repeat(5000) }) })!;
    expect(huge.summary!.length).toBeLessThanOrEqual(1400);
    expect(huge.approach!.length).toBeLessThanOrEqual(3500);
  });
});
