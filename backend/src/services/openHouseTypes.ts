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
  timezone: string;
  registration_url: string | null;
  meeting_link: string | null;
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
