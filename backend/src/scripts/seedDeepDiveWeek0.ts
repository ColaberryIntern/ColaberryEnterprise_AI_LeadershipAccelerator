/**
 * seedDeepDiveWeek0 — place the Week 0 "SDLC Field Guide" Deep Dive card on the
 * canonical program and load its self-contained HTML as the card content.
 *
 * Week 0 is a FIXED, read-only Field Guide (the SDLC overview / map for the 12 weeks):
 * no per-project generation. The HTML is a self-contained artifact (inline CSS+JS +
 * inlined Colaberry logo) rendered by the `deepdive` branch of CardDetailBody in a
 * sandboxed `allow-scripts` iframe. We store it at `metadata.content.body_html` and set
 * `metadata.locked = true` so `ensureFreshContent` never regenerates it.
 *
 * Idempotent: re-running updates the existing Week 0 deep_dive card's HTML in place
 * (so pushing a new build of the guide just re-runs this). Keyed on
 * (cohort_id=null, program_id, week=0, type='deep_dive').
 *
 * Run in the dev/prod backend container:
 *   node dist/scripts/seedDeepDiveWeek0.js
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { resolveOrThrow } from '../services/timeline/typeRegistry';
import { composeCardAttributes } from '../services/timeline/timelineAdminService';
import { DEEP_DIVE_WK0_HTML_B64 } from '../data/deepDiveWeek0Html';

const CANONICAL_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

export async function seedDeepDiveWeek0(programId = CANONICAL_PROGRAM): Promise<{ created: boolean; card_id: string }> {
  const html = Buffer.from(DEEP_DIVE_WK0_HTML_B64, 'base64').toString('utf8');
  const content = { title: 'SDLC Field Guide', body_html: html };

  const existing: any = await TimelineCard.findOne({
    where: { cohort_id: null, program_id: programId, week: 0, type: 'deep_dive' },
  });

  if (existing) {
    const meta = { ...(existing.metadata || {}), content, content_at: new Date().toISOString(), locked: true, authored: true };
    await existing.update({ metadata: meta, visibility: 'published', status: 'active' });
    return { created: false, card_id: existing.id };
  }

  const def = resolveOrThrow('deep_dive');
  const max = await (TimelineCard as any).max('order', {
    where: { cohort_id: null, program_id: programId, week: 0, bucket: 'learn' },
  });
  const order = (typeof max === 'number' ? max : -1) + 1;
  const attrs = composeCardAttributes(def, {
    type: 'deep_dive',
    program_id: programId,
    week: 0,
    bucket: 'learn',
    title: 'Deep Dive - Understanding Modern Software Development',
    visibility: 'published',
    description: 'The SDLC Field Guide - the map for the next twelve weeks.',
    content,
  } as any, order);
  const card: any = await TimelineCard.create(attrs as any);
  // Lock so ensureFreshContent never regenerates this hand-authored artifact.
  await card.update({ metadata: { ...(card.metadata || {}), locked: true } });
  return { created: true, card_id: card.id };
}

if (require.main === module) {
  seedDeepDiveWeek0()
    .then((r) => { console.log('[seedDeepDiveWeek0] ' + JSON.stringify(r)); return sequelize.close(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[seedDeepDiveWeek0] ERROR ' + (e && e.message ? e.message : e)); process.exit(1); });
}

export default seedDeepDiveWeek0;
