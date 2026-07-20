/**
 * curriculumFormatContract — enforces that the Experience Studio "demo" (the
 * admin StudentPreview) and the real Classroom "timeline event" render in the
 * SAME format for EVERY curriculum type, and that every type HAS an explicitly
 * defined format.
 *
 * Why this exists: both surfaces render through the one shared <CardDetailBody>
 * driven by a card's `render_band` + `student_label`. The real feed
 * (backend timelineService.getFeed) sets those from the type registry; the Studio
 * demo builds the same card via adaptToFeedCard fed `sel.render_band` /
 * `sel.label`. They can only diverge two ways, both guarded here:
 *   1. A registry `render_band` with no entry in the frontend BAND map → the card
 *      silently falls back to the generic 'reading' visual. The type then loses
 *      its intended format in BOTH the demo and the timeline.
 *   2. adaptToFeedCard failing to preserve the band/label the registry assigned.
 *
 * The registry is read from source (single source of truth, zero duplication), so
 * adding a curriculum type with a new render_band fails this test until the
 * frontend gains a matching visual.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BAND, visualFor } from '../TimelineCard';
import { adaptToFeedCard } from '../../../utils/cardAdapter';

interface RegistryType { slug: string; student_label: string; render_band: string }

/** Locate backend/src/services/timeline/typeRegistry.ts from either the test dir or the frontend cwd. */
function registryPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../../../backend/src/services/timeline/typeRegistry.ts'),
    path.resolve(process.cwd(), '../backend/src/services/timeline/typeRegistry.ts'),
    path.resolve(process.cwd(), 'backend/src/services/timeline/typeRegistry.ts'),
  ];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(`typeRegistry.ts not found. Tried:\n${candidates.join('\n')}`);
  }
  return found;
}

/** Parse the CARD_TYPES array out of the registry source (D({ ... }) entries). */
function parseRegistry(src: string): RegistryType[] {
  const start = src.indexOf('export const CARD_TYPES');
  if (start < 0) throw new Error('CARD_TYPES not found in registry source');
  const body = src.slice(start, src.indexOf('\n];', start));
  const field = (chunk: string, name: string): string | undefined =>
    chunk.match(new RegExp(`${name}:\\s*'([^']*)'`))?.[1];
  return [...body.matchAll(/D\(\{([\s\S]*?)\}\)/g)]
    .map((m) => ({
      slug: field(m[1], 'slug') || '',
      student_label: field(m[1], 'student_label') || '',
      render_band: field(m[1], 'render_band') || '',
    }))
    .filter((t) => t.slug && t.render_band);
}

describe('curriculum format contract (Experience Studio demo === Classroom timeline event)', () => {
  const types = parseRegistry(fs.readFileSync(registryPath(), 'utf-8'));

  it('parsed the curriculum type registry', () => {
    // sanity: the registry currently has 36 canonical types
    expect(types.length).toBeGreaterThanOrEqual(30);
    for (const t of types) expect(t.student_label).toBeTruthy();
  });

  it('every curriculum type render_band has an explicit frontend visual (never the silent reading fallback)', () => {
    const unmapped = types.filter((t) => !(t.render_band in BAND)).map((t) => `${t.slug} -> ${t.render_band}`);
    expect(unmapped).toEqual([]);
  });

  it('the Studio demo card preserves the exact band + label the real timeline event uses, for every type', () => {
    const mismatches: string[] = [];
    for (const t of types) {
      // The real Classroom timeline event (as timelineService.getFeed serializes it):
      const timelineBand = t.render_band;
      const timelineLabel = t.student_label;
      // The Experience Studio demo (StudentPreview -> adaptToFeedCard, fed sel.render_band / sel.label):
      const demo = adaptToFeedCard({ render_band: t.render_band, student_label: t.student_label, label: t.student_label });
      if (demo.render_band !== timelineBand) mismatches.push(`${t.slug}: band ${demo.render_band} !== ${timelineBand}`);
      if (demo.student_label !== timelineLabel) mismatches.push(`${t.slug}: label ${demo.student_label} !== ${timelineLabel}`);
      if (visualFor(demo.render_band).kind !== visualFor(timelineBand).kind) {
        mismatches.push(`${t.slug}: kind ${visualFor(demo.render_band).kind} !== ${visualFor(timelineBand).kind}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('adaptToFeedCard defaults band to "overview" — matching the backend getFeed fallback', () => {
    // Both sides fall back to 'overview' for an unknown/absent band, so an
    // under-specified card still renders identically in the demo and the feed.
    expect(adaptToFeedCard({ label: 'x' }).render_band).toBe('overview');
    expect('overview' in BAND).toBe(true);
  });

  it('adaptToFeedCard carries the type banner through as type_thumbnail (default card image)', () => {
    // The type's AI banner is the card's DEFAULT image on the timeline; a media
    // card's own art (video poster / blog thumbnail) overrides it at render.
    const url = '/thumbnails/curriculum-types/overview.jpg';
    expect(adaptToFeedCard({ label: 'x', type_thumbnail: url }).type_thumbnail).toBe(url);
    expect(adaptToFeedCard({ label: 'x' }).type_thumbnail).toBeNull();
  });
});
