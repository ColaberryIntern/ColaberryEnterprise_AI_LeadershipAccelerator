/**
 * The `hire-refactored` lead source: intro requests from hire.refactored.ai.
 *
 * Its own file because `seedLeadSources.ts` is at 484 lines and the 500-line ceiling is a
 * hard one; the seed imports this and lists it beside the others, so the seed's
 * idempotent upsert (by source slug, entry slug and form definition) covers it unchanged.
 *
 * No `hmac_secret`: the caller is the platform's own route (`POST /api/public/hire/intro`),
 * which validates the body with zod and calls the ingest service in-process. Nothing
 * reaches /api/leads/ingest from a browser with this source.
 *
 * `field_map` matches exactly the body `hireIntro.ts` builds. `talent_slug` and
 * `idempotency_key` travel as metadata so a lead row says which person it is about and
 * which once-a-day key admitted it.
 */
/** The shape seedLeadSources' SeedEntryPoint accepts (structurally; that type is file-local). */
interface HireEntryPoint {
  slug: string;
  name: string;
  page: string;
  form_name: string;
  description: string;
  field_map: Record<string, string>;
  required_fields: string[];
}

export const HIRE_REFACTORED_LEAD_SOURCE: { slug: string; name: string; domain: string; entry_points: HireEntryPoint[] } = {
  slug: 'hire-refactored',
  name: 'Hire · Refactored.ai',
  domain: 'hire.refactored.ai',
  entry_points: [
    {
      slug: 'intro_request',
      name: 'Intro Request',
      page: '/intro',
      form_name: 'hire-intro',
      description: 'An employer asks to be introduced to a listed engineer on hire.refactored.ai',
      field_map: {
        name: 'name',
        email: 'email',
        company: 'company',
        role: 'role',
        message: 'metadata.message',
        talent_slug: 'metadata.talent_slug',
        idempotency_key: 'metadata.idempotency_key',
      },
      required_fields: ['email'],
    },
    {
      // Profile upgrade phase 4: an employer books a time on /talent/<slug>/schedule/.
      // The interview row is the record; this lead is the employer, attributed to Hire,
      // and the source-wide `notify_sales` rule is what tells the Colaberry team.
      slug: 'interview_request',
      name: 'Interview Request',
      page: '/talent/schedule',
      form_name: 'hire-interview',
      description: 'An employer books an interview time with a listed engineer on hire.refactored.ai',
      field_map: {
        name: 'name',
        email: 'email',
        company: 'company',
        role: 'role',
        message: 'metadata.message',
        talent_slug: 'metadata.talent_slug',
        interview_id: 'metadata.interview_id',
        format: 'metadata.format',
        starts_at: 'metadata.starts_at',
      },
      required_fields: ['email'],
    },
  ],
};
