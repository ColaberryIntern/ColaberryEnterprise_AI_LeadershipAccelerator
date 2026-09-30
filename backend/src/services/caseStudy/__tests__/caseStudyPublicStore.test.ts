/**
 * caseStudyPublicStore - the read path. T014.
 *
 * NO DATABASE. Every Sequelize model is replaced by the in-memory fakes in
 * `publicModelFakes.ts`, which honour the WHERE clause they are given, so the
 * surface scoping and the pin resolution below are really being tested.
 *
 * The two properties that matter: content comes from the PIN and never from "the
 * newest snapshot", and a pin that resolves to a DRAFT is refused outright.
 */

import { internalSnapshotContent } from './publicFixtures';
import { APPROVED_STAMPS, fakes, resetFakes, seedPublishedRecord } from './publicModelFakes';

jest.mock('../../../models/CaseStudy', () => ({ __esModule: true, default: fakes.studies }));
jest.mock('../../../models/CaseStudyPublication', () => ({ __esModule: true, default: fakes.publications }));
jest.mock('../../../models/CaseStudySnapshot', () => ({ __esModule: true, default: fakes.snapshots }));
jest.mock('../../../models/CaseStudyCollection', () => ({ __esModule: true, default: fakes.collections }));

import * as store from '../caseStudyPublicStore';

beforeEach(resetFakes);

/* -------------------------------------------------------------- the pin --- */

describe('published content comes from the pin', () => {
  it('returns the PINNED snapshot, not the newest approved one', async () => {
    const { study } = seedPublishedRecord();
    fakes.snapshots.seed({
      id: 'snap-newer', case_study_id: study.id, version: 9, ...APPROVED_STAMPS,
      content: internalSnapshotContent({
        identity: { slug: 'stockout-forecasting', title: 'A NEWER TITLE NOBODY PUBLISHED' },
      }),
    });
    const [record] = await store.loadSurfacePublications('enterprise');
    expect(record.content.identity.title).toBe('Cutting stockouts with a forecasting agent');
  });

  it('refuses a pin that resolves to a DRAFT snapshot', async () => {
    seedPublishedRecord({ snapshot: { status: 'draft', approved_by: null, approved_at: null } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
  });

  it('refuses a snapshot with an approved status but no approval stamps', async () => {
    seedPublishedRecord({ snapshot: { approved_by: null, approved_at: null } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
  });

  it('accepts a SUPERSEDED snapshot that still carries its approval stamps', async () => {
    seedPublishedRecord({ snapshot: { status: 'superseded' } });
    expect(await store.loadSurfacePublications('enterprise')).toHaveLength(1);
  });

  it('drops a publication with no pin at all', async () => {
    seedPublishedRecord({ publication: { published_snapshot_id: null } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
  });

  it('drops a dangling pin', async () => {
    seedPublishedRecord({ publication: { published_snapshot_id: 'snap-never-existed' } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
  });

  it('drops a snapshot whose content has no identity section', async () => {
    seedPublishedRecord({ content: { taxonomy: {} } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
  });
});

/* -------------------------------------------------------------- surface --- */

describe('surface scoping', () => {
  it('a training publication is not loaded for enterprise', async () => {
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    expect(await store.loadSurfacePublications('enterprise')).toEqual([]);
    expect(await store.loadSurfacePublications('training')).toHaveLength(1);
  });

  it('the by-slug read is surface-scoped too', async () => {
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    expect(await store.loadPublishedRecordBySlug('stockout-forecasting', 'enterprise')).toBeNull();
    expect(await store.loadPublishedRecordBySlug('stockout-forecasting', 'training')).not.toBeNull();
  });

  it('an unknown slug reads as null, exactly like a wrong-surface slug', async () => {
    seedPublishedRecord({ publication: { surface_key: 'training' } });
    expect(await store.loadPublishedRecordBySlug('no-such-record', 'enterprise')).toBeNull();
    expect(await store.loadPublishedRecordBySlug('stockout-forecasting', 'enterprise')).toBeNull();
  });
});

/* ------------------------------------------------------------ candidate --- */

describe('the candidate it builds', () => {
  it('reports editorial state truthfully rather than filtering it away in SQL', async () => {
    seedPublishedRecord({ study: { status: 'draft' }, publication: { status: 'unpublished' } });
    const [record] = await store.loadSurfacePublications('enterprise');
    expect(record.candidate.caseStudyStatus).toBe('draft');
    expect(record.candidate.publicationStatus).toBe('unpublished');
  });

  it('carries repository VISIBILITIES and no repository identity', async () => {
    seedPublishedRecord();
    const [record] = await store.loadSurfacePublications('enterprise');
    expect(record.candidate.repoVisibilities).toEqual(['public', 'private', 'unknown']);
    const serialized = JSON.stringify(record.candidate);
    expect(serialized).not.toContain('acme-private-org');
    expect(serialized).not.toContain('private-internal-repo');
  });

  it('normalises taxonomy facets to canonical slugs', async () => {
    seedPublishedRecord();
    const [record] = await store.loadSurfacePublications('enterprise');
    expect(record.candidate.industry).toBe('retail-distribution');
    expect(record.candidate.stack).toEqual(['typescript', 'postgres']);
    expect(record.candidate.verificationClass).toBe('verified');
    expect(record.candidate.projectStatus).toBe('shipped');
  });

  it('marks an archived record archived from either signal', async () => {
    seedPublishedRecord({ study: { archived_at: new Date('2026-08-23T00:00:00.000Z') } });
    const [a] = await store.loadSurfacePublications('enterprise');
    expect(a.candidate.archived).toBe(true);
    resetFakes();
    seedPublishedRecord({ study: { status: 'archived' } });
    const [b] = await store.loadSurfacePublications('enterprise');
    expect(b.candidate.archived).toBe(true);
  });
});

/* ----------------------------------------------------------- collections --- */

describe('saved collections', () => {
  const seedCollection = (over: Record<string, unknown> = {}) => fakes.collections.seed({
    id: 'col-1', slug: 'agents', surface_key: 'enterprise', status: 'published',
    title: 'Agent builds', description: 'Agentic work.',
    filter_config: { capability: 'agents,forecasting', featured: true },
    sort_config: { sort: 'newest' },
    ...over,
  });

  it('loads a published collection on this surface', async () => {
    seedCollection();
    expect(await store.loadPublishedCollection('agents', 'enterprise')).toEqual({
      slug: 'agents', surfaceKey: 'enterprise', title: 'Agent builds',
      description: 'Agentic work.', status: 'published', sort: 'newest',
      filters: { capability: ['agents', 'forecasting'], featured: true },
    });
  });

  it('refuses a DRAFT collection', async () => {
    seedCollection({ status: 'draft' });
    expect(await store.loadPublishedCollection('agents', 'enterprise')).toBeNull();
  });

  it('refuses a collection saved against another surface', async () => {
    seedCollection({ surface_key: 'training' });
    expect(await store.loadPublishedCollection('agents', 'enterprise')).toBeNull();
  });

  it('falls back to a known sort when sort_config is junk', async () => {
    seedCollection({ sort_config: { sort: 'by-vibes' } });
    expect((await store.loadPublishedCollection('agents', 'enterprise'))?.sort).toBe('featured');
  });

  it('reads filter_config key by known key and ignores everything else', () => {
    expect(store.toFilterInput({
      capability: ['agents'], verification: 'verified,anonymized',
      published_snapshot_id: 'leak', notes: 'leak', reviewNotes: 'leak',
    })).toEqual({ capability: ['agents'], verificationClass: ['verified', 'anonymized'] });
  });
});
