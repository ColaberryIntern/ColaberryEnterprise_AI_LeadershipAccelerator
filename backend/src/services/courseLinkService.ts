import CurriculumCourseLink, {
  CourseLinkProvider,
  CourseLinkStatus,
} from '../models/CurriculumCourseLink';

// Plain-object shape attached to each curriculum module in the portal payload.
export interface CourseLink {
  module_number: number;
  provider: CourseLinkProvider;
  course_title: string | null;
  course_url: string | null;
  link_status: CourseLinkStatus;
}

function log(event: string, ctx: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level: 'warn',
      service: 'backend',
      event,
      ...ctx,
    })
  );
}

function classifyError(err: unknown): string {
  const message = (err as Error)?.message || '';
  // Postgres "relation ... does not exist" = table not seeded yet on this env.
  if (/does not exist|no such table|relation .* does not exist/i.test(message)) {
    return 'SchemaNotReady';
  }
  return 'DbError';
}

/**
 * Returns a map of module_number -> CourseLink for every seeded curriculum week.
 *
 * Fail-soft by design: the curriculum endpoint is critical, and a course-link
 * catalog that is missing (table not seeded on a given env) or briefly unavailable
 * must never 500 the whole curriculum page. On any query error this logs a
 * structured warning and returns an empty map, so modules simply render without a
 * course CTA. There are no retries here — a missing catalog is a deploy/seed step,
 * not a transient fault, and the empty-map fallback is the correct degraded state.
 */
export async function getCourseLinkMap(): Promise<Map<number, CourseLink>> {
  try {
    const rows = await CurriculumCourseLink.findAll({
      attributes: ['module_number', 'provider', 'course_title', 'course_url', 'link_status'],
      order: [['module_number', 'ASC']],
    });

    return new Map(
      rows.map((r) => [
        r.module_number,
        {
          module_number: r.module_number,
          provider: r.provider,
          course_title: r.course_title,
          course_url: r.course_url,
          link_status: r.link_status,
        },
      ])
    );
  } catch (err) {
    log('course_link_map_unavailable', {
      outcome: 'failure',
      error_class: classifyError(err),
      message: (err as Error)?.message,
    });
    return new Map();
  }
}
