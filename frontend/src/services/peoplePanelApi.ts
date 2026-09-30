import portalApi from '../utils/portalApi';

// Role-aware "People" panel for the PortalShell right rail. Data comes from
// GET /api/portal/people/panel. The endpoint is flag-gated on the server
// (PEOPLE_PANEL_ROLES_ENABLED): when OFF it returns { enabled:false } and the caller
// falls back to the legacy cohort-presence rail (fetchCohortPresence). Fetching here is
// fail-soft — any error (or a disabled flag) resolves to null so the rail never breaks.
//
// Presence vocabulary matches the cohort rail (online | idle | offline) so the same
// te-ctpres dot styles apply.

export type PanelPresence = 'online' | 'idle' | 'offline';

export interface PanelPerson {
  member_id: string | null;
  enrollment_id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
  presence: PanelPresence;
  cohort_name?: string;
}

export interface PanelClass {
  cohort_id: string;
  name: string;
  members: number;
  online: number;
}

export interface PanelBusiness {
  sponsor_id: string;
  company: string;
  seats: number;
  online: number;
}

export interface StaffPanel {
  viewer_role: 'staff';
  online: PanelPerson[];
  classes: PanelClass[];
  businesses: PanelBusiness[];
}

export interface StudentPanel {
  viewer_role: 'student';
  my_class: PanelPerson[];
  active_now: PanelPerson[];
}

export type PeoplePanel = StaffPanel | StudentPanel;

interface PanelResponse {
  enabled?: boolean;
  viewer_role?: 'staff' | 'student';
  online?: PanelPerson[];
  classes?: PanelClass[];
  businesses?: PanelBusiness[];
  my_class?: PanelPerson[];
  active_now?: PanelPerson[];
}

/**
 * Fetch the role-aware people panel. Resolves to null when the feature flag is OFF
 * (server sends { enabled:false }) or on any error — the caller then falls back to the
 * legacy cohort-presence rail. Never throws.
 */
export async function fetchPeoplePanel(): Promise<PeoplePanel | null> {
  try {
    const { data } = await portalApi.get<PanelResponse>('/api/portal/people/panel');
    if (!data?.enabled) return null;
    if (data.viewer_role === 'staff') {
      return {
        viewer_role: 'staff',
        online: data.online ?? [],
        classes: data.classes ?? [],
        businesses: data.businesses ?? [],
      };
    }
    if (data.viewer_role === 'student') {
      return {
        viewer_role: 'student',
        my_class: data.my_class ?? [],
        active_now: data.active_now ?? [],
      };
    }
    return null;
  } catch {
    return null;
  }
}
