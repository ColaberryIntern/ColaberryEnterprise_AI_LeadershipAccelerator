import api from '../utils/api';

/** Career Prep v27 (CP2.1): the staff read of students' prep. Read-only; gated `placement` on the server. */
export interface PrepStudentRow { enrollmentId: string; name: string; lastObserved: string; observations: number; readiness?: number }
export interface StaffSkill { key: string; label: string; score?: number; change30?: number; count: number; sources: string[] }
export interface StaffDashboard {
  readiness?: { value: number; target?: number };
  skills: StaffSkill[];
  sources: Record<string, number>;
  streak: number;
  thisWeek: number;
}

export async function fetchPrepStudents(): Promise<PrepStudentRow[]> {
  return (await api.get('/api/admin/placement/students')).data.students;
}

export async function fetchStudentPrep(enrollmentId: string): Promise<StaffDashboard> {
  return (await api.get(`/api/admin/placement/students/${encodeURIComponent(enrollmentId)}/prep`)).data.dashboard;
}
