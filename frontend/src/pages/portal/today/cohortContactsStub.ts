// ============================================================================
// STUB — cohort contacts for the PortalShell right-hand "Contacts" rail.
//
// This is placeholder data so the Facebook-style rail has something to render.
// Replace with a real presence feed when the backend lands:
//   GET /api/portal/cohort/presence  ->  CohortContact[]
// (name, initials, avatar colour/url, live presence). Until then the rail shows
// this static roster. Nothing here hits the network.
// ============================================================================

export type Presence = 'online' | 'idle' | 'offline';

export interface CohortContact {
  name: string;
  initials: string;
  /** Avatar background colour (design-E palette hues). */
  color: string;
  presence: Presence;
  /** Optional level/role label — surfaced later in a member popover. */
  role?: string;
}

// ~12 members across the three presence states, ordered online-first so the rail
// reads like a live roster. Colours are drawn from the design-E accent family.
export const COHORT_CONTACTS: CohortContact[] = [
  { name: 'Dev Kumar',   initials: 'DK', color: '#E8920C', presence: 'online',  role: 'Architect' },
  { name: 'Aanya R.',    initials: 'AR', color: '#367895', presence: 'online',  role: 'Architect' },
  { name: 'Jordan M.',   initials: 'JM', color: '#5BA63C', presence: 'online',  role: 'Builder' },
  { name: 'Priya N.',    initials: 'PN', color: '#C20E1E', presence: 'online',  role: 'Builder' },
  { name: 'Lena Park',   initials: 'LP', color: '#6B4FA0', presence: 'online',  role: 'Builder' },
  { name: 'Yuki Tanaka', initials: 'YT', color: '#2E6A86', presence: 'online',  role: 'Architect' },
  { name: 'Omar Haddad', initials: 'OH', color: '#B5710A', presence: 'online',  role: 'Builder' },
  { name: 'Hana Cho',    initials: 'HC', color: '#3C7A26', presence: 'idle',    role: 'Builder' },
  { name: 'Rosa Perez',  initials: 'RP', color: '#5BA63C', presence: 'idle',    role: 'Builder' },
  { name: 'Marcus Hill', initials: 'MH', color: '#367895', presence: 'offline', role: 'Explorer' },
  { name: 'Bea Nguyen',  initials: 'BN', color: '#E8920C', presence: 'offline', role: 'Explorer' },
  { name: 'Carlos Ruiz', initials: 'CR', color: '#6B6B6B', presence: 'offline', role: 'Explorer' },
];

/** Members who are reachable now (online or idle) — drives the "N online" count. */
export const onlineCount = (list: CohortContact[] = COHORT_CONTACTS): number =>
  list.filter((c) => c.presence !== 'offline').length;
