/** Asset ids and paths admit exactly one shape, so nothing can be traversed. */
import path from 'path';
import { assetDir, assetFile, assetUrl, isAssetId, isVideoFileKind, newAssetId } from '../hireVideoFiles';
import { sameJson } from '../../../seeds/leadSources/sameJson';

const ROOT = path.resolve('/srv/hire-video');

test('a minted id is 24 hex and resolves to a directory directly under the root', () => {
  const id = newAssetId();
  expect(isAssetId(id)).toBe(true);
  expect(newAssetId()).not.toBe(id);
  expect(assetDir(id, ROOT)).toBe(path.join(ROOT, id));
  expect(assetFile(id, 'poster', ROOT)).toBe(path.join(ROOT, id, 'poster.jpg'));
  expect(assetUrl(id, 'stream')).toBe(`/api/public/hire/video/${id}/stream`);
});

test('anything else is refused before a path is built', () => {
  for (const bad of ['../../etc/passwd', '..', `${'a'.repeat(23)}/`, 'A'.repeat(24), `${'a'.repeat(24)}x`, '', null]) {
    expect(isAssetId(bad)).toBe(false);
    expect(() => assetDir(bad as string, ROOT)).toThrow();
  }
  expect(isVideoFileKind('stream')).toBe(true);
  expect(isVideoFileKind('toString')).toBe(false);
  expect(isVideoFileKind('../stream')).toBe(false);
});

test('the lead-source seed compares maps the way Postgres JSONB returns them', () => {
  // JSONB reorders keys; the seed used to treat that as a change and bump a version every run.
  expect(sameJson({ name: 'name', email: 'email', interview_id: 'm.i' }, { email: 'email', interview_id: 'm.i', name: 'name' })).toBe(true);
  expect(sameJson({ name: 'name' }, { name: 'full_name' })).toBe(false);
  expect(sameJson(['email', 'name'], ['name', 'email'])).toBe(false); // array order is data
});
