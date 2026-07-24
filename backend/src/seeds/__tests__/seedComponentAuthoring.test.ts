/**
 * Contract tests for the curriculum-type AI thumbnails: every type in the
 * registry has an authored thumbnail_url, every authored slug really exists in
 * the registry (so seedComponentAuthoring never reports `missing`), and the
 * shipped static asset exists for each URL.
 */
import * as fs from 'fs';
import * as path from 'path';
import { COMPONENT_AUTHORING } from '../seedComponentAuthoring';
import { SYSTEM_TYPES } from '../seedCurriculumTypeDefinitions';
import { CARD_TYPES } from '../../services/timeline/typeRegistry';

const URL_RE = /^\/thumbnails\/curriculum-types\/[a-z0-9_]+\.jpg$/;
// registry types + legacy pre-registry types — everything the Studio grid shows
const registrySlugs = new Set([
  ...CARD_TYPES.map((t) => t.slug),
  ...SYSTEM_TYPES.map((t) => t.slug),
]);
// repo-root frontend/public (present in the repo checkout; absent in the
// backend-only Docker image, where the asset check is skipped)
const PUBLIC_DIR = path.resolve(__dirname, '..', '..', '..', '..', 'frontend', 'public');

describe('curriculum-type thumbnails', () => {
  it('every registry type has an authored thumbnail_url of the shipped shape', () => {
    const missing = [...registrySlugs].filter((slug) => {
      const url = COMPONENT_AUTHORING[slug]?.thumbnail_url;
      return !url || !URL_RE.test(url);
    });
    // Adding a new type to CARD_TYPES? Generate its banner with
    // scripts/curriculum-type-thumbnails/ and it joins THUMBNAIL_SLUGS.
    expect(missing).toEqual([]);
  });

  it('every authored slug exists in the registry (seed reports no missing)', () => {
    const unknown = Object.keys(COMPONENT_AUTHORING).filter((slug) => !registrySlugs.has(slug));
    expect(unknown).toEqual([]);
  });

  it('the static asset file exists for every thumbnail_url', () => {
    if (!fs.existsSync(PUBLIC_DIR)) return; // backend-only context (Docker image)
    const broken = Object.entries(COMPONENT_AUTHORING)
      .filter(([, fields]) => typeof fields.thumbnail_url === 'string' && URL_RE.test(fields.thumbnail_url as string))
      .filter(([, fields]) => !fs.existsSync(path.join(PUBLIC_DIR, fields.thumbnail_url as string)))
      .map(([slug]) => slug);
    expect(broken).toEqual([]);
  });
});
