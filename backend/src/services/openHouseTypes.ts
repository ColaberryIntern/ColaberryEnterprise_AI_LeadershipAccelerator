/**
 * Shared view contracts for the portal onboarding / schedule surface.
 *
 * Extracted into their own module so both `openHouseService` (which builds the
 * schedule) and `publicEventsService` (which sources public events from CCPP)
 * can depend on them without importing each other — avoiding a circular
 * dependency. The frontend keeps its own mirror of these shapes in
 * `frontend/src/services/onboardingApi.ts`; keep the two in sync.
 */

export interface OpenHouseView {
  id: string;
  title: string;
  description: string | null;
  starts_at: Date;
  /** End of the event, when CCPP knows it. Lets the Events page show a range. */
  ends_at: Date | null;
  timezone: string;
  registration_url: string | null;
  meeting_link: string | null;
  /**
   * Eventbrite promo image (CCPP `EventBrite_Events.Logo_url`), an absolute
   * img.evbuc.com URL. Null on the Postgres fallback, which has no image
   * column — every consumer must degrade gracefully rather than assume one.
   */
  image_url: string | null;
  /**
   * How many DISTINCT people have registered on Eventbrite, read from the CCPP
   * `EventBrite_EventAttendees` mirror. Distinct-by-email because one order can
   * write several attendee rows (the legacy training site badges 14 for an event
   * with 30 rows, and that is the number learners recognise).
   *
   * This is a REAL count or it is null — never a fabricated placeholder. Null
   * means "not known" (Postgres fallback, or the attendee query failed) and must
   * render as no badge rather than as zero.
   */
  signup_count: number | null;
  /**
   * Whether THIS learner has registered, matched on their email in the CCPP
   * attendee mirror. Per-viewer, so it is layered on per request and is
   * deliberately NOT part of the shared cross-user event cache.
   */
  is_registered: boolean;
}

export interface FirstClassView {
  start_date: string;
  core_day: string | null;
  core_time: string | null;
  timezone: string | null;
  cohort_name: string | null;
  source: 'my_cohort' | 'next_open_cohort';
}

export interface OnboardingSchedule {
  next_open_house: OpenHouseView | null;
  my_rsvp: boolean;
  first_class: FirstClassView | null;
}
