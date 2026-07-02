// Idempotent: creates the curriculum_course_links table if absent, then upserts
// the 12 week->course rows. Safe to run repeatedly (ON CONFLICT on module_number).
// Run via: npx ts-node backend/src/seeds/seedCurriculumCourseLinks.ts
//
// Source of truth for the week->course map is backend/src/scripts/lib/curriculumWeeks.js
// (WEEKS[]). module_number == week (1-12). The confirmed/pending split reflects the
// BC decision (todo 9985688697 — deep-link delivery on enterprise.colaberry.com):
//   - Skilljar URLs verified live against catalog: weeks 1/2/3/5/6/7/8 -> 'confirmed'
//   - Colaberry-original weeks 4/9/10/11 -> no Skilljar course ('not_applicable')
//   - week 12 -> external CCA-F exam (known public URL, 'confirmed')
// If WEEKS changes, update COURSE_LINK_ROWS to match.

import { sequelize } from '../config/database';

export type CourseLinkProvider = 'skilljar' | 'external_cert' | 'colaberry_original';
export type CourseLinkStatus = 'confirmed' | 'pending_confirmation' | 'not_applicable';

export interface CourseLinkSeedRow {
  module_number: number;
  provider: CourseLinkProvider;
  course_title: string | null;
  course_url: string | null;
  link_status: CourseLinkStatus;
}

const SKILLJAR = 'https://anthropic.skilljar.com';
const CCA_F = 'https://claudecertifications.com/claude-certified-architect/exam-guide';

export const COURSE_LINK_ROWS: CourseLinkSeedRow[] = [
  { module_number: 1,  provider: 'skilljar',           course_title: 'Claude Code 101',                               course_url: `${SKILLJAR}/claude-code-101`,                          link_status: 'confirmed' },
  { module_number: 2,  provider: 'skilljar',           course_title: 'Introduction to Agent Skills',                   course_url: `${SKILLJAR}/introduction-to-agent-skills`,             link_status: 'confirmed' },
  { module_number: 3,  provider: 'skilljar',           course_title: 'Claude with the Anthropic API',                  course_url: `${SKILLJAR}/claude-with-the-anthropic-api`,            link_status: 'confirmed' },
  { module_number: 4,  provider: 'colaberry_original', course_title: 'Prompt Engineering (Colaberry-original)',        course_url: null,                                                   link_status: 'not_applicable' },
  { module_number: 5,  provider: 'skilljar',           course_title: 'Introduction to Model Context Protocol',         course_url: `${SKILLJAR}/introduction-to-model-context-protocol`,   link_status: 'confirmed' },
  { module_number: 6,  provider: 'skilljar',           course_title: 'Model Context Protocol: Advanced Topics',        course_url: `${SKILLJAR}/model-context-protocol-advanced-topics`,   link_status: 'confirmed' },
  { module_number: 7,  provider: 'skilljar',           course_title: 'Introduction to Subagents',                      course_url: `${SKILLJAR}/introduction-to-subagents`,                link_status: 'confirmed' },
  { module_number: 8,  provider: 'skilljar',           course_title: 'Claude Code in Action',                          course_url: `${SKILLJAR}/claude-code-in-action`,                    link_status: 'confirmed' },
  { module_number: 9,  provider: 'colaberry_original', course_title: 'Reliability Engineering (Colaberry-original)',   course_url: null,                                                   link_status: 'not_applicable' },
  { module_number: 10, provider: 'colaberry_original', course_title: 'Governance (Colaberry-original)',                course_url: null,                                                   link_status: 'not_applicable' },
  { module_number: 11, provider: 'colaberry_original', course_title: 'Systems Architecture (Colaberry-original)',      course_url: null,                                                   link_status: 'not_applicable' },
  { module_number: 12, provider: 'external_cert',      course_title: 'Claude Certified Architect - Foundations (CCA-F exam)', course_url: CCA_F,                                            link_status: 'confirmed' },
];

export async function seedCurriculumCourseLinks(): Promise<void> {
  await sequelize.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS curriculum_course_links (
      id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      module_number INTEGER     NOT NULL UNIQUE,
      provider      VARCHAR(30) NOT NULL CHECK (provider IN ('skilljar', 'external_cert', 'colaberry_original')),
      course_title  TEXT,
      course_url    TEXT,
      link_status   VARCHAR(30) NOT NULL CHECK (link_status IN ('confirmed', 'pending_confirmation', 'not_applicable')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  for (const row of COURSE_LINK_ROWS) {
    await sequelize.query(
      `INSERT INTO curriculum_course_links (module_number, provider, course_title, course_url, link_status)
       VALUES (:module_number, :provider, :course_title, :course_url, :link_status)
       ON CONFLICT (module_number) DO UPDATE
         SET provider     = EXCLUDED.provider,
             course_title = EXCLUDED.course_title,
             course_url   = EXCLUDED.course_url,
             link_status  = EXCLUDED.link_status,
             updated_at   = NOW()`,
      { replacements: row as unknown as Record<string, unknown> },
    );
  }
}

if (require.main === module) {
  seedCurriculumCourseLinks()
    .then(() => {
      console.log(`curriculum_course_links ready — ${COURSE_LINK_ROWS.length} rows upserted`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('seed failed:', err);
      process.exit(1);
    });
}
