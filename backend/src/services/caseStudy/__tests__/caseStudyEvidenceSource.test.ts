/**
 * caseStudyEvidenceSource — unit tests. T008 AC2, AC3 and AC5.
 *
 * NO DATABASE. All four models are mocked, so this suite runs under
 * `jest.ci.config.ts` with `DATABASE_URL` unset.
 *
 * The source-table mocks (`EvidenceRecord`, `PortfolioArtifact`) expose every
 * write method Sequelize offers, each wired to a jest.fn that the suite asserts
 * was never called. That is the runtime half of AC2's "links without mutating";
 * the static half reads the module text, because "we remembered not to" is not
 * an invariant.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

interface Row { [key: string]: unknown }

/** Every write Sequelize offers on a model, so "was it called?" covers all of them. */
const WRITE_METHODS = ['create', 'update', 'destroy', 'upsert', 'bulkCreate', 'save'] as const;

/** A read-only source table whose write methods exist purely to be asserted unused. */
function mockSourceModel() {
  const writes: Record<string, jest.Mock> = {};
  for (const name of WRITE_METHODS) writes[name] = jest.fn();
  return {
    rows: [] as Row[],
    lastQuery: null as Row | null,
    writes,
    reset(): void {
      this.rows = []; this.lastQuery = null;
      for (const fn of Object.values(writes)) fn.mockReset();
    },
  };
}

const mockEvidence = mockSourceModel();
const mockArtifacts = mockSourceModel();

/**
 * Bound lazily through a getter thunk: `jest.mock` is hoisted above the `const`
 * declarations above, so a factory that dereferenced them eagerly would hit the
 * temporal dead zone. `mockSourceModel` is a hoisted function declaration, which
 * is why calling it from inside a factory is safe.
 */
function mockWriteSurface(bag: () => { writes: Record<string, jest.Mock> }) {
  const surface: Record<string, (...args: unknown[]) => unknown> = {};
  for (const name of WRITE_METHODS) surface[name] = (...a: unknown[]) => bag().writes[name](...a);
  return surface;
}

/** A fake `case_study_*` table: records every insert so the suite can inspect it. */
class FakeTable {
  rows: Row[] = [];
  inserts: Row[] = [];
  failOnInsert: number | null = null;

  reset(): void { this.rows = []; this.inserts = []; this.failOnInsert = null; }

  async findAll(opts: { where?: Row }): Promise<Row[]> {
    const caseStudyId = opts?.where?.case_study_id;
    return this.rows.filter((r) => r.case_study_id === caseStudyId);
  }

  async create(values: Row): Promise<Row> {
    if (this.failOnInsert !== null && this.inserts.length === this.failOnInsert) {
      const err: any = new Error('insert or update violates foreign key constraint');
      err.name = 'SequelizeForeignKeyConstraintError';
      throw err;
    }
    const row = { id: randomUUID(), ...values };
    this.inserts.push(values);
    this.rows.push(row);
    return row;
  }
}

const mockEvidenceTable = new FakeTable();
const mockArtifactTable = new FakeTable();

jest.mock('../../../models/EvidenceRecord', () => ({
  __esModule: true,
  default: {
    findAll: async (opts: any) => { mockEvidence.lastQuery = opts; return mockEvidence.rows; },
    ...mockWriteSurface(() => mockEvidence),
  },
}));

jest.mock('../../../models/PortfolioArtifact', () => ({
  __esModule: true,
  default: {
    findAll: async (opts: any) => { mockArtifacts.lastQuery = opts; return mockArtifacts.rows; },
    ...mockWriteSurface(() => mockArtifacts),
  },
}));

jest.mock('../../../models/CaseStudyEvidence', () => ({
  __esModule: true,
  default: {
    findAll: (o: any) => mockEvidenceTable.findAll(o),
    create: (v: any) => mockEvidenceTable.create(v),
  },
}));

jest.mock('../../../models/CaseStudyArtifact', () => ({
  __esModule: true,
  default: {
    findAll: (o: any) => mockArtifactTable.findAll(o),
    create: (v: any) => mockArtifactTable.create(v),
  },
}));

import {
  MAX_LINKED_ARTIFACTS,
  MAX_LINKED_EVIDENCE,
  artifactTypeForKind,
  evidenceSourceTypeFor,
  isCaseStudyEvidenceSourceError,
  linkPortfolioArtifacts,
  linkProjectEvidence,
} from '../caseStudyEvidenceSource';

const CASE_STUDY_ID = randomUUID();
const ENROLLMENT_ID = randomUUID();
const STUDENT_EMAIL = 'learner@example.com';

let logs: string[] = [];

beforeEach(() => {
  mockEvidence.reset();
  mockArtifacts.reset();
  mockEvidenceTable.reset();
  mockArtifactTable.reset();
  logs = [];
  jest.spyOn(console, 'log').mockImplementation((line?: unknown) => { logs.push(String(line)); });
});

afterEach(() => { jest.restoreAllMocks(); });

function evidenceRow(over: Row = {}): Row {
  return {
    id: randomUUID(), enrollment_id: ENROLLMENT_ID, card_id: randomUUID(),
    source_type: 'github_commit', builder_xp: 25, validated: true,
    source_ref: 'https://github.com/acmeholdings/clientwidget/commit/abc123',
    idempotency_key: 'evidence:1', ...over,
  };
}

function artifactRow(over: Row = {}): Row {
  return {
    id: randomUUID(), enrollment_id: ENROLLMENT_ID, card_id: randomUUID(),
    kind: 'architecture_doc', title: 'Reorder point architecture',
    summary: 'How the forecaster is wired.', ...over,
  };
}

/** Names the offending method in the failure message rather than just "0 vs 1". */
const noWrites = (mock: { writes: Record<string, jest.Mock> }): void => {
  for (const [name, fn] of Object.entries(mock.writes)) {
    expect([name, fn.mock.calls.length]).toEqual([name, 0]);
  }
};

/* ───────────────── AC2 — link EvidenceRecord, never mutate it ───────────── */

describe('AC2 — EvidenceRecord rows are linked, never written', () => {
  it('calls no write method on either source model (runtime half)', async () => {
    mockEvidence.rows = [evidenceRow(), evidenceRow({ source_type: 'prompt_lab' })];
    mockArtifacts.rows = [artifactRow()];

    await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    noWrites(mockEvidence);
    noWrites(mockArtifacts);
    expect(mockEvidenceTable.inserts).toHaveLength(2);
    expect(mockArtifactTable.inserts).toHaveLength(1);
  });

  it('never names a write on a source model in its own source text (static half)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyEvidenceSource.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    for (const model of ['EvidenceRecordModel', 'PortfolioArtifactModel']) {
      for (const write of ['create', 'update', 'destroy', 'upsert', 'bulkCreate', 'save', 'increment']) {
        expect(code).not.toContain(`${model}.${write}`);
      }
      expect(code).toContain(`${model}.findAll`);
    }
    // No transaction machinery either — a read needs none.
    expect(code).not.toContain('sequelize.transaction');
  });

  it('writes only a pointer, and never a verified or publicly open one', async () => {
    const record = evidenceRow({ source_type: 'peer_review', validated: true });
    mockEvidence.rows = [record];

    const result = await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    const insert = mockEvidenceTable.inserts[0];
    expect(insert.case_study_id).toBe(CASE_STUDY_ID);
    expect(insert.evidence_record_id).toBe(record.id);
    expect(insert.source_type).toBe('evidence_record');
    expect(insert.title).toBe('Peer review evidence');
    // `validated: true` on the source does NOT promote the link.
    expect(insert.verification_class).toBe('pending');
    expect(insert.is_publicly_openable).toBe(false);
    expect(insert.metadata).toEqual({
      platform_source_type: 'peer_review', builder_xp: 25, platform_validated: true,
    });
    expect(result.linked[0].verificationClass).toBe('pending');
    // The enrollment never travels into the linked row.
    expect(JSON.stringify(insert)).not.toContain(ENROLLMENT_ID);
  });

  it('is idempotent: a second run writes nothing', async () => {
    mockEvidence.rows = [evidenceRow(), evidenceRow()];

    const first = await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    const second = await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(first.created).toBe(2);
    expect(second.created).toBe(0);
    expect(second.alreadyLinked).toBe(2);
    expect(mockEvidenceTable.inserts).toHaveLength(2);
  });

  it('bounds the read and honours a caller limit', async () => {
    mockEvidence.rows = [evidenceRow()];
    await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID, limit: 5 });
    expect((mockEvidence.lastQuery as { limit: number }).limit).toBe(5);

    await linkProjectEvidence({ caseStudyId: randomUUID(), enrollmentId: ENROLLMENT_ID });
    expect((mockEvidence.lastQuery as { limit: number }).limit).toBe(MAX_LINKED_EVIDENCE);
    expect((mockEvidence.lastQuery as { where: Row }).where.enrollment_id).toBe(ENROLLMENT_ID);
  });

  it('leaves earlier rows in place when an insert fails, and completes on re-run', async () => {
    mockEvidence.rows = [evidenceRow(), evidenceRow(), evidenceRow()];
    mockEvidenceTable.failOnInsert = 2;

    await expect(linkProjectEvidence({
      caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID,
    })).rejects.toThrow(/foreign key/);
    expect(mockEvidenceTable.inserts).toHaveLength(2);

    mockEvidenceTable.failOnInsert = null;
    const retry = await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    expect(retry.created).toBe(1);
    expect(retry.alreadyLinked).toBe(2);
    noWrites(mockEvidence);
  });
});

/* ────────────── AC3 — artifacts land as candidates, never promoted ───────── */

describe('AC3 — PortfolioArtifact rows become candidates only', () => {
  it('creates every row with status "candidate" and no public URL', async () => {
    mockArtifacts.rows = [artifactRow(), artifactRow({ kind: 'presentation' })];

    const result = await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(result.created).toBe(2);
    for (const insert of mockArtifactTable.inserts) {
      expect(insert.status).toBe('candidate');
      expect(insert.visibility).toBe('private');
      expect(insert.public_url).toBeNull();
      expect(insert.preview_url).toBeNull();
      expect(insert.source_type).toBe('portfolio_artifact');
    }
    for (const artifact of result.artifacts) {
      expect(artifact.status).toBe('candidate');
      expect(artifact.publicUrl).toBeUndefined();
    }
    expect(mockArtifactTable.inserts[1].artifact_type).toBe('deck');
  });

  it('cannot promote an artifact: the word never appears in the module code', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyEvidenceSource.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/approv/i);
    expect(code).not.toMatch(/reviewed_by|reviewed_at/);
    expect(code).toContain("status: 'candidate'");
  });

  it('is idempotent per portfolio artifact', async () => {
    const row = artifactRow();
    mockArtifacts.rows = [row];

    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    const second = await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(second.created).toBe(0);
    expect(second.alreadyLinked).toBe(1);
    expect(mockArtifactTable.inserts[0].portfolio_artifact_id).toBe(row.id);
  });

  it('bounds the read at MAX_LINKED_ARTIFACTS', async () => {
    mockArtifacts.rows = [artifactRow()];
    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    expect((mockArtifacts.lastQuery as { limit: number }).limit).toBe(MAX_LINKED_ARTIFACTS);
  });
});

/* ─── AC5 — `kind === 'case_study'` is an artifact kind, not a Case Study ─── */

describe("AC5 — PortfolioArtifact.kind 'case_study' is never a CaseStudy record", () => {
  it('links it as an ordinary document artifact', async () => {
    const row = artifactRow({ kind: 'case_study', title: "A learner's case-study writeup" });
    mockArtifacts.rows = [row];

    const result = await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(result.created).toBe(1);
    const insert = mockArtifactTable.inserts[0];
    expect(insert.artifact_type).toBe('document');
    expect(insert.status).toBe('candidate');
    // It points AT the Case Study; it did not become one.
    expect(insert.case_study_id).toBe(CASE_STUDY_ID);
    expect(insert.portfolio_artifact_id).toBe(row.id);
    expect(result.artifacts[0].artifactType).toBe('document');
  });

  it('imports no CaseStudy model and creates no case_studies row', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'caseStudyEvidenceSource.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

    expect(code).not.toMatch(/from '\.\.\/\.\.\/models\/CaseStudy'/);
    expect(code).not.toMatch(/from '\.\.\/\.\.\/models\/CaseStudySnapshot'/);
    expect(code).not.toContain('case_studies');
    // The two Case Study tables it MAY write are exactly these.
    expect(code).toContain('CaseStudyEvidenceModel.create');
    expect(code).toContain('CaseStudyArtifactModel.create');
  });

  it('maps every documented kind, and fails closed on anything else', () => {
    expect(artifactTypeForKind('case_study')).toBe('document');
    expect(artifactTypeForKind('architecture_doc')).toBe('architecture');
    expect(artifactTypeForKind('prompt_library')).toBe('document');
    expect(artifactTypeForKind('reflection')).toBe('document');
    expect(artifactTypeForKind('implementation_notes')).toBe('document');
    expect(artifactTypeForKind('presentation')).toBe('deck');
    expect(artifactTypeForKind('something_a_migration_invented')).toBe('other');
    expect(artifactTypeForKind(null)).toBe('other');
  });
});

/* ─────────────────────── boundaries, mapping and hygiene ─────────────────── */

describe('boundaries, mapping and log hygiene', () => {
  it('returns an empty, valid result for an enrollment with nothing recorded', async () => {
    const evidence = await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });
    const artifacts = await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(evidence).toEqual({ linked: [], created: 0, alreadyLinked: 0, scanned: 0 });
    expect(artifacts).toEqual({ artifacts: [], created: 0, alreadyLinked: 0, scanned: 0 });
    expect(JSON.parse(logs[0]).outcome).toBe('unchanged');
  });

  it('truncates a 400-char artifact title to the 300-char column', async () => {
    const long = 'x'.repeat(400);
    mockArtifacts.rows = [artifactRow({ title: long })];

    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(String(mockArtifactTable.inserts[0].title)).toHaveLength(300);
  });

  it('substitutes a title for a blank one rather than failing the NOT NULL column', async () => {
    mockArtifacts.rows = [artifactRow({ title: '   ', summary: '  ' })];

    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID });

    expect(mockArtifactTable.inserts[0].title).toBe('Untitled portfolio artifact');
    expect(mockArtifactTable.inserts[0].description).toBeNull();
  });

  it('maps the three exact evidence source types and keeps the rest honest', () => {
    expect(evidenceSourceTypeFor('github_commit')).toBe('github_commit');
    expect(evidenceSourceTypeFor('github_pr')).toBe('github_pr');
    expect(evidenceSourceTypeFor('artifact')).toBe('artifact');
    for (const other of ['prompt_lab', 'peer_review', 'instructor_review', 'deliverable',
      'implementation', 'portfolio', 'invented_later', null, undefined]) {
      expect(evidenceSourceTypeFor(other)).toBe('evidence_record');
    }
  });

  it('rejects a malformed request with zod issues attached', async () => {
    try {
      await linkProjectEvidence({ caseStudyId: 'nope', enrollmentId: ENROLLMENT_ID });
      throw new Error('should have thrown');
    } catch (err) {
      expect(isCaseStudyEvidenceSourceError(err)).toBe(true);
      const typed = err as { error_class: string; http_status: number; details: { issues: unknown[] } };
      expect(typed.error_class).toBe('CaseStudyEvidenceValidationError');
      expect(typed.http_status).toBe(400);
      expect(Array.isArray(typed.details.issues)).toBe(true);
    }
    expect(mockEvidenceTable.inserts).toHaveLength(0);
  });

  it('emits no enrollment id, card id, email, source ref or artifact title', async () => {
    const card = randomUUID();
    mockEvidence.rows = [evidenceRow({
      card_id: card, source_ref: `https://github.com/acmeholdings/clientwidget?u=${STUDENT_EMAIL}`,
    })];
    mockArtifacts.rows = [artifactRow({ card_id: card, title: 'Acme Holdings reorder deck' })];

    await linkProjectEvidence({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID, correlationId: 'corr-9' });
    await linkPortfolioArtifacts({ caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID, correlationId: 'corr-9' });

    expect(logs.length).toBe(2);
    const all = logs.join('\n');
    for (const secret of [
      ENROLLMENT_ID, card, STUDENT_EMAIL, '@', 'acmeholdings', 'clientwidget',
      'Acme Holdings reorder deck', 'Reorder point architecture',
    ]) {
      expect(all).not.toContain(secret);
    }

    const entry = JSON.parse(logs[0]);
    expect(entry.service).toBe('case-study-evidence-source');
    expect(entry.event).toBe('case_study_evidence_source.link_evidence');
    expect(entry.correlation_id).toBe('corr-9');
    expect(entry.case_study_id).toBe(CASE_STUDY_ID);
    expect(entry).toMatchObject({ scanned: 1, created: 1, already_linked: 0, outcome: 'success' });
  });

  it('logs the failure path with an error class and no PII', async () => {
    mockEvidence.rows = [evidenceRow()];
    mockEvidenceTable.failOnInsert = 0;

    await expect(linkProjectEvidence({
      caseStudyId: CASE_STUDY_ID, enrollmentId: ENROLLMENT_ID,
    })).rejects.toThrow();

    const entry = JSON.parse(logs[0]);
    expect(entry.level).toBe('error');
    expect(entry.outcome).toBe('failure');
    expect(entry.error_class).toBe('SequelizeForeignKeyConstraintError');
    expect(JSON.stringify(entry)).not.toContain(ENROLLMENT_ID);
  });
});
