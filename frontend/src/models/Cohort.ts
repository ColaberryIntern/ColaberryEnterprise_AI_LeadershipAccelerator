export interface Cohort {
  id: string;
  name: string;
  description?: string;
  start_date: string;
  core_day: string;
  core_time: string;
  optional_lab_day: string | null;
  timezone?: string;
  max_seats: number;
  seats_taken: number;
  status?: 'open' | 'closed' | 'completed';
  cohort_type?: string;
  /**
   * `YYYY-MM` for a monthly batch, null for the legacy fixed-start cohorts.
   *
   * This is the ONLY way to tell the two apart. A batch's `start_date` is its
   * orientation and falls in the month AFTER the batch; a legacy cohort's
   * `start_date` is a genuine start. Printing `start_date` without checking
   * this is what made the open November batch advertise "December 7, 2026".
   */
  batch_month?: string | null;
}
