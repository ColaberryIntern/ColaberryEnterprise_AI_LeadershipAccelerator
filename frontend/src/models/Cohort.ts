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
}
