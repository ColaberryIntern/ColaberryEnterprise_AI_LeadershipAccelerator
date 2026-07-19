/**
 * seedDeepDiveFieldGuides — place the Deep Dive "Field Guide" cards on the canonical
 * program with their self-contained HTML content. Week 0 = read-only SDLC Field Guide;
 * Week 1 = Business Analysis Field Guide (build-prompt + upload flow).
 *
 * Idempotent, keyed on (cohort_id null, program, week, type='deep_dive'). Sets
 * metadata.locked=true so `ensureFreshContent` never regenerates. The HTML ships as
 * base64 (the backend image excludes docs/); regen the *Html.ts modules from
 * docs/deep-dive/*.html when a guide changes. IMPORTANT: keep each guide's body_html
 * under ~64KB — a larger srcDoc truncates the trailing <script> in the sandboxed iframe
 * and NO JS runs (de-inline the logo, reference it by URL). See the deep-dive field-guide
 * platform memory.
 *
 * Run: node dist/scripts/seedDeepDiveFieldGuides.js
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { resolveOrThrow } from '../services/timeline/typeRegistry';
import { composeCardAttributes } from '../services/timeline/timelineAdminService';
import { DEEP_DIVE_WK0_HTML_B64 } from '../data/deepDiveWeek0Html';
import { DEEP_DIVE_WK1_HTML_B64 } from '../data/deepDiveWeek1Html';
import { DEEP_DIVE_WK2_HTML_B64 } from '../data/deepDiveWeek2Html';
import { DEEP_DIVE_WK3_HTML_B64 } from '../data/deepDiveWeek3Html';
import { DEEP_DIVE_WK4_HTML_B64 } from '../data/deepDiveWeek4Html';
import { DEEP_DIVE_WK5_HTML_B64 } from '../data/deepDiveWeek5Html';
import { DEEP_DIVE_WK6_HTML_B64 } from '../data/deepDiveWeek6Html';
import { DEEP_DIVE_WK7_HTML_B64 } from '../data/deepDiveWeek7Html';
import { DEEP_DIVE_WK8_HTML_B64 } from '../data/deepDiveWeek8Html';
import { DEEP_DIVE_WK9_HTML_B64 } from '../data/deepDiveWeek9Html';
import { DEEP_DIVE_WK10_HTML_B64 } from '../data/deepDiveWeek10Html';
import { DEEP_DIVE_WK11_HTML_B64 } from '../data/deepDiveWeek11Html';
import { DEEP_DIVE_WK12_HTML_B64 } from '../data/deepDiveWeek12Html';

const CANONICAL_PROGRAM = '92b98a72-8681-4f04-8ba1-16a18334cd0b';

interface Guide { week: number; title: string; description: string; b64: string; requiresUpload: boolean; }
const bg = (week: number, role: string, b64: string): Guide =>
  ({ week, title: `Deep Dive - ${role}`, description: `The ${role} Field Guide - build it in your own Claude Code.`, b64, requiresUpload: true });
const GUIDES: Guide[] = [
  // Week 0 is read-only (the SDLC map) — no build prompt, no upload.
  { week: 0, title: 'Deep Dive - Understanding Modern Software Development', description: 'The SDLC Field Guide - the map for the next twelve weeks (read-only).', b64: DEEP_DIVE_WK0_HTML_B64, requiresUpload: false },
  // Week 1+ the student builds a Field Guide in their own Claude Code and uploads it
  // (requires_field_guide_upload gates completion server-side + awards 100 points).
  // The SDLC-discipline arc (role-framed) from the Week 0 roadmap.
  { week: 1, title: 'Deep Dive - Business Analyst', description: 'The Business Analyst Field Guide - build it in your own Claude Code.', b64: DEEP_DIVE_WK1_HTML_B64, requiresUpload: true },
  bg(2, 'Solution Architect', DEEP_DIVE_WK2_HTML_B64),
  bg(3, 'Project Manager', DEEP_DIVE_WK3_HTML_B64),
  bg(4, 'Software Engineer', DEEP_DIVE_WK4_HTML_B64),
  bg(5, 'UX Designer', DEEP_DIVE_WK5_HTML_B64),
  bg(6, 'QA Engineer', DEEP_DIVE_WK6_HTML_B64),
  bg(7, 'Integration Engineer', DEEP_DIVE_WK7_HTML_B64),
  bg(8, 'AI Engineer', DEEP_DIVE_WK8_HTML_B64),
  bg(9, 'Data Architect', DEEP_DIVE_WK9_HTML_B64),
  bg(10, 'DevOps Engineer', DEEP_DIVE_WK10_HTML_B64),
  bg(11, 'Governance Lead', DEEP_DIVE_WK11_HTML_B64),
  bg(12, 'AI Solution Architect', DEEP_DIVE_WK12_HTML_B64),
];

async function seedOne(g: Guide, programId: string): Promise<{ week: number; created: boolean; card_id: string }> {
  const html = Buffer.from(g.b64, 'base64').toString('utf8');
  const content = { title: g.title, body_html: html };
  const existing: any = await TimelineCard.findOne({ where: { cohort_id: null, program_id: programId, week: g.week, type: 'deep_dive' } });
  if (existing) {
    const meta = { ...(existing.metadata || {}), content, content_at: new Date().toISOString(), locked: true, authored: true, requires_field_guide_upload: g.requiresUpload };
    await existing.update({ metadata: meta, title: g.title, description: g.description, visibility: 'published', status: 'active' });
    return { week: g.week, created: false, card_id: existing.id };
  }
  const def = resolveOrThrow('deep_dive');
  const max = await (TimelineCard as any).max('order', { where: { cohort_id: null, program_id: programId, week: g.week, bucket: 'learn' } });
  const order = (typeof max === 'number' ? max : -1) + 1;
  const attrs = composeCardAttributes(def, { type: 'deep_dive', program_id: programId, week: g.week, bucket: 'learn', title: g.title, visibility: 'published', description: g.description, content } as any, order);
  const card: any = await TimelineCard.create(attrs as any);
  await card.update({ metadata: { ...(card.metadata || {}), locked: true, requires_field_guide_upload: g.requiresUpload } });
  return { week: g.week, created: true, card_id: card.id };
}

export async function seedDeepDiveFieldGuides(programId = CANONICAL_PROGRAM) {
  const out = [];
  for (const g of GUIDES) out.push(await seedOne(g, programId));
  return out;
}

if (require.main === module) {
  seedDeepDiveFieldGuides()
    .then((r) => { console.log('[seedDeepDiveFieldGuides] ' + JSON.stringify(r)); return sequelize.close(); })
    .then(() => process.exit(0))
    .catch((e) => { console.error('[seedDeepDiveFieldGuides] ERROR ' + (e && e.message ? e.message : e)); process.exit(1); });
}

export default seedDeepDiveFieldGuides;
