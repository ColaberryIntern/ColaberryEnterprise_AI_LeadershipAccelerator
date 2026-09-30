/**
 * The vendored gov-opportunity.v1 schema is PINNED to the producer's authoritative committed blob, and the Zod
 * boundary validator agrees with it. The stakes: the live adapter validates OP's `.data` against the Zod schema
 * before an approval binds to it; if the vendored contract drifts from the producer, or the Zod validator requires
 * a field the contract treats as optional, the boundary check is either wrong or a fake.
 */
import fs from 'fs';
import path from 'path';
import { govOpportunityV1Schema, ZOD_REQUIRED_TOP_LEVEL, CANONICAL_ID_RE } from '../govOpportunityV1.zod';
import crypto from 'crypto';

const SCHEMA_PATH = path.join(__dirname, '..', 'govOpportunityV1.schema.json');
// The producer's AUTHORITATIVE committed (LF) hash. A mutation control: if the vendored schema changes by even
// one byte, this fails — it is the pin to OP PR #3 head a530b982 / contract of record.
const PINNED_LF_SHA256 = '26ff667ed6d669d35fc89dc13886042f23620b1b9cf97b0fc90f1597d6cdd6bb';

describe('vendored gov-opportunity.v1 schema pin', () => {
  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  // Normalize CRLF -> LF before hashing so an autocrlf checkout on Windows still matches the LF blob.
  const lf = raw.replace(/\r\n/g, '\n');

  it('matches the producer\'s authoritative LF sha256 (pin / mutation control)', () => {
    const sha = crypto.createHash('sha256').update(lf, 'utf8').digest('hex');
    expect(sha).toBe(PINNED_LF_SHA256);
  });

  it('the Zod boundary validator requires only fields the pinned schema also marks required (no over-strict boundary)', () => {
    const schema = JSON.parse(lf);
    const required: string[] = Array.isArray(schema.required) ? schema.required : [];
    const notInContract = ZOD_REQUIRED_TOP_LEVEL.filter((k) => !required.includes(k));
    expect(notInContract).toEqual([]);
  });

  it('the pinned schema still declares documents.items (the field the coverage gate binds on)', () => {
    const schema = JSON.parse(lf);
    const docs = schema.properties?.documents;
    expect(docs?.properties?.items).toBeTruthy();
    expect(docs?.required).toEqual(expect.arrayContaining(['coverage', 'counts', 'items']));
  });
});

describe('govOpportunityV1Schema (Zod boundary)', () => {
  const validData = () => ({
    schemaVersion: 'gov-opportunity.v1',
    canonicalOpportunityId: 'op:gov:0000000000000000000000000000aaaa',
    sourceSnapshotVersion: 3,
    sourceSystem: 'opportunity-pulse',
    sourceRecordId: '123',
    notice: { noticeType: { value: 'solicitation' } },
    publisher: { leadBuyer: { name: 'City' } },
    deadline: { originalText: null, utc: null, utcConfidence: 'unknown', conflicts: [] },
    value: { published: null, modelEstimate: null },
    documents: {
      coverage: 'complete',
      counts: { listed: 1, downloaded: 1, parsed: 1, inaccessible: 0 },
      items: [{ docId: 'D1', filename: 's.pdf', role: 'solicitation', retrieval: { status: 'downloaded', method: 'direct_download' } }],
    },
    requirements: [],
    timestamps: {},
    sourceAssessment: { legacyVerdict: null },
    companyQualification: null,
  });

  it('parses a valid v1 .data payload (extra producer fields tolerated)', () => {
    expect(govOpportunityV1Schema.safeParse(validData()).success).toBe(true);
  });

  it('rejects a bad canonical id', () => {
    expect(govOpportunityV1Schema.safeParse({ ...validData(), canonicalOpportunityId: 'gov-123' }).success).toBe(false);
    expect(CANONICAL_ID_RE.test('op:gov:0000000000000000000000000000aaaa')).toBe(true);
  });

  it('rejects a payload missing documents.items (the coverage-gate field)', () => {
    const d: any = validData();
    delete d.documents.items;
    expect(govOpportunityV1Schema.safeParse(d).success).toBe(false);
  });

  it('rejects a non-null companyQualification (contract says it must be null)', () => {
    expect(govOpportunityV1Schema.safeParse({ ...validData(), companyQualification: { x: 1 } }).success).toBe(false);
  });

  it('rejects an unknown documents.coverage enum value', () => {
    const d: any = validData();
    d.documents.coverage = 'mostly';
    expect(govOpportunityV1Schema.safeParse(d).success).toBe(false);
  });
});
