import type { CampusAudience } from '../campusMap';

/**
 * The Admissions building's plans and services (Basecamp C21, v6 D3). Pure: which cards, which prices (claim keys, never typed
 * figures), and the one action each card and each service row offers THIS viewer.
 *
 *  - Prices render through the claims registry (<Claim>), so a price the registry has not approved for the route renders nothing.
 *    The Explorer card carries no figure (there is no claim for one): it says "No card needed".
 *  - Pitch rule (Ali, 2026-10-24): the annual membership first; month-to-month is not on the wall (pricing.individual.monthly is
 *    not approved for any route, and Maya mentions it only when someone pushes back).
 *  - Every action reuses a flow that already exists: Settings' Subscription and Team tabs, the public enroll and sponsorship
 *    pages, the C20 booking sheet. Nothing here starts a payment by itself.
 */
export const PLANS_ROUTE = '/portal/plans';

export type PlanId = 'explorer' | 'individual' | 'team' | 'services';
export type PlanAction =
  | { kind: 'current'; label: string }
  | { kind: 'link'; label: string; to: string; external?: boolean }
  | { kind: 'book'; label: string }
  | null;

export interface PlanCard {
  id: PlanId;
  name: string;
  /** The claim that carries the price, or null for "No card needed". */
  priceClaim: string | null;
  priceText: string | null;
  unit: string;
  /** A second governed line (Team: the department price). */
  subClaim: string | null;
  subText: string | null;
  blurb: string;
  featured: boolean;
}

export const PLAN_CARDS: PlanCard[] = [
  { id: 'explorer', name: 'Explorer', priceClaim: null, priceText: 'No card needed', unit: 'to start', subClaim: null, subText: null,
    blurb: 'Explore the platform yourself: the learner experience, sample projects and a live class preview.', featured: false },
  { id: 'individual', name: 'One license', priceClaim: 'pricing.individual.annual', priceText: null, unit: '/mo, billed annually', subClaim: null, subText: null,
    blurb: 'Full access for one person, from first login to Certified Architect: classes, projects, certification prep and the network.', featured: true },
  { id: 'team', name: 'Team licenses', priceClaim: 'pricing.team', priceText: null, unit: '/seat, per year', subClaim: 'pricing.department', subText: 'Enterprise: custom',
    blurb: 'Reassignable annual seats for your team, with one management dashboard for readiness, adoption and results.', featured: false },
  { id: 'services', name: 'Services', priceClaim: 'pricing.services', priceText: null, unit: '', subClaim: null, subText: null,
    blurb: 'Hands-on help building and deploying AI with your team, scoped with you on a call.', featured: false },
];

export interface Viewer {
  audience: CampusAudience;
  /** The learner's own subscription is active (Settings' Subscription tab). */
  subscribed: boolean;
}

const SUB = '/portal/settings?tab=subscription';
const TEAM = '/portal/settings?tab=team';

/** The one action on a plan card for this viewer (null: no button). */
export function cardAction(id: PlanId, v: Viewer): PlanAction {
  if (id === 'services') return { kind: 'book', label: '📅 Book a call' };
  if (id === 'explorer') return v.audience === 'explorer' ? { kind: 'current', label: 'Your current tier' } : null;
  if (id === 'individual') {
    if (v.audience === 'staff' || v.audience === 'business') return null;
    return v.subscribed ? { kind: 'current', label: 'Your current tier' } : { kind: 'link', label: 'Activate', to: SUB };
  }
  // team
  if (v.audience === 'staff') return null;
  return v.audience === 'business' ? { kind: 'link', label: 'Activate seats', to: TEAM } : { kind: 'link', label: 'Activate seats', to: '/sponsorship', external: true };
}

export type ServiceId = 'individual' | 'team' | 'redeem' | 'billing' | 'services';
export interface ServiceRow { id: ServiceId; label: string; action: PlanAction }

/** "Sign up or change a service": only the rows that apply to this viewer, business viewers' seats first. */
export function serviceRows(v: Viewer): ServiceRow[] {
  const individual: ServiceRow = { id: 'individual', label: 'Individual plan', action: v.subscribed ? { kind: 'current', label: '✓ Active' } : { kind: 'link', label: 'Activate', to: SUB } };
  const team: ServiceRow = { id: 'team', label: 'Team licenses', action: { kind: 'link', label: 'Add seats', to: TEAM } };
  const redeem: ServiceRow = { id: 'redeem', label: 'Redeem a seat code', action: { kind: 'link', label: 'Redeem', to: '/enroll', external: true } };
  const billing: ServiceRow = { id: 'billing', label: 'Subscription & billing', action: { kind: 'link', label: 'Manage', to: SUB } };
  const services: ServiceRow = { id: 'services', label: 'Services', action: { kind: 'book', label: 'Book a call' } };
  switch (v.audience) {
    case 'business': return [team, services];
    case 'staff': return [services];
    case 'explorer': return [individual, redeem, services];
    default: return v.subscribed ? [individual, billing, services] : [individual, redeem, billing, services];
  }
}
