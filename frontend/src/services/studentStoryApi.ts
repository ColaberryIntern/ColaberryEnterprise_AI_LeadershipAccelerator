import api from '../utils/api';

// Support role's read-only student-story surface. Uses the shared admin axios
// instance (attaches admin_token). Backend: admin/studentStoryRoutes, gated by
// requireSection('students'). The story itself is fetched by PersonHistoryDrawer
// with endpointBase '/api/admin/students'.

export interface StudentSummary {
  enrollment_id: string;
  display_name: string;
  email: string | null;
  signed_up_at: string | null;
}

export async function fetchStudents(search?: string): Promise<StudentSummary[]> {
  const { data } = await api.get<{ students: StudentSummary[] }>(
    '/api/admin/students',
    search?.trim() ? { params: { search: search.trim() } } : undefined,
  );
  return data.students;
}
