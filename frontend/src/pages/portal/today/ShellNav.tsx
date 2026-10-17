import React from 'react';
import { Link } from 'react-router-dom';
import type { GatedFeatureKey } from '../../../components/paywall/gatedFeatures';

/**
 * The portal's classic navigation: the grouped left rail (nav.te-nav) and the
 * phone bottom tab bar (nav.te-tabbar). Moved out of PortalShell.tsx unchanged
 * (Colaberry Campus C2) so the shell can swap either one for the campus without
 * growing further; PortalShell was 796 lines against a 500-line ceiling.
 * The markup is byte-identical to what PortalShell rendered before the move -
 * components/campus/__tests__/campusNoChange.test.tsx pins that with a snapshot.
 */

// `gate` marks an item as content-paywalled (<PageGate> on its route) — the item
// STAYS a clickable Link (unlike `soon`, which fully disables it): a free/unpaid
// student can click through and see the upsell screen the route itself renders.
export type NavItem = { label: string; to?: string; icon: React.ReactNode; soon?: boolean; newTab?: boolean; gate?: GatedFeatureKey };
export type NavGroup = { grp: string; items: NavItem[] };

/**
 * How many items each nav group shows before "More". The sidebar had grown to
 * 12 destinations across three groups and read as a wall; two per group keeps
 * the common paths one click away and the rest one click behind. Group item
 * ORDER therefore carries meaning — the first two are the defaults.
 */
export const NAV_PRIMARY_COUNT = 2;

/**
 * Split a group into the items always shown and the ones behind "More" (pure).
 *
 * `activeTo` forces the group open when the current page lives in the overflow —
 * otherwise a learner on Path or Portfolio sees no highlighted item anywhere in
 * the sidebar and cannot tell where they are.
 */
export function splitNavGroup(
  items: NavItem[],
  expanded: boolean,
  activeTo?: string,
): { shown: NavItem[]; hidden: NavItem[]; activeIsHidden: boolean } {
  if (items.length <= NAV_PRIMARY_COUNT) return { shown: items, hidden: [], activeIsHidden: false };
  const primary = items.slice(0, NAV_PRIMARY_COUNT);
  const overflow = items.slice(NAV_PRIMARY_COUNT);
  const isActive = (n: NavItem) => !!n.to && !!activeTo && (activeTo === n.to || activeTo.startsWith(n.to + '/'));
  const activeIsHidden = overflow.some(isActive);
  const open = expanded || activeIsHidden;
  return { shown: open ? items : primary, hidden: open ? [] : overflow, activeIsHidden };
}

export interface ClassicNavProps {
  groups: NavGroup[];
  active: string;
  navCollapsed: boolean;
  navExpanded: Record<string, boolean>;
  onToggleGroup: (grp: string) => void;
  todayBadge?: number;
  isStaff: boolean;
  hasFullAccess: boolean;
  cohortName: string;
}

export function ClassicNav({ groups, active, navCollapsed, navExpanded, onToggleGroup, todayBadge, isStaff, hasFullAccess, cohortName }: ClassicNavProps): React.ReactElement {
  return (
      <nav className="te-nav">
        {groups.map((group) => {
          // When the rail is collapsed to icons the rows are tiny and the "More"
          // control is hidden by CSS, so force every item visible — otherwise the
          // overflow items would be unreachable in that mode.
          const { shown, hidden, activeIsHidden } = splitNavGroup(
            group.items, !!navExpanded[group.grp] || navCollapsed, active,
          );
          return (
          <React.Fragment key={group.grp}>
            <div className="grp">{group.grp}</div>
            {shown.map((n) => {
              const isActive = !!n.to && (active === n.to || active.startsWith(n.to + '/'));
              const inner = (
                <>
                  <span className="ic">{n.icon}</span>
                  <span className="lb">{n.label}</span>
                  {n.label === 'Today' && !!todayBadge && todayBadge > 0 && <span className="badge">{todayBadge}</span>}
                  {n.gate && !isStaff && !hasFullAccess && (
                    <span className="te-navlock" title="Requires a paid seat" aria-label="Locked — requires a paid seat">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" aria-hidden="true">
                        <rect x="5" y="10" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    </span>
                  )}
                  {n.soon && <span className="te-soon">Soon</span>}
                </>
              );
              if (isActive) return <span key={n.label} className="te-navbtn active">{inner}</span>;
              if (n.soon) return <span key={n.label} className="te-navbtn is-soon" title="Coming soon" aria-disabled="true">{inner}</span>;
              // Open in a NEW TAB (e.g. Management Portal) so the student session stays put.
              if (n.newTab) return <a key={n.label} className="te-navbtn" href={n.to!} target="_blank" rel="noopener noreferrer">{inner}</a>;
              return <Link key={n.label} className="te-navbtn" to={n.to!}>{inner}</Link>;
            })}
            {/* Only offered when collapsing actually hides something. When the
                active page sits in the overflow the group is force-opened, so
                the control reads "Show less" rather than lying about a count. */}
            {(hidden.length > 0 || (group.items.length > NAV_PRIMARY_COUNT && !activeIsHidden)) && (
              <button
                type="button"
                className="te-navmore"
                aria-expanded={hidden.length === 0}
                onClick={() => onToggleGroup(group.grp)}
              >
                <span className="ic" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d={hidden.length > 0 ? 'M6 9l6 6 6-6' : 'M6 15l6-6 6 6'}
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="lb">{hidden.length > 0 ? `${hidden.length} more` : 'Show less'}</span>
              </button>
            )}
          </React.Fragment>
          );
        })}

        <div className="te-presence">
          <div className="h"><span className="pdot" /> {cohortName}</div>
          <div className="te-onrow" style={{ cursor: 'default' }}>
            <span className="pmini">+</span> Meet your cohort when you enroll
          </div>
        </div>
      </nav>
  );
}

export interface ClassicTabBarProps {
  tabItems: NavItem[];
  active: string;
  todayBadge?: number;
}

/** Bottom tab bar (mobile only via CSS) - nav reachable on phones. */
export function ClassicTabBar({ tabItems, active, todayBadge }: ClassicTabBarProps): React.ReactElement {
  return (
      <nav className="te-tabbar">
        {tabItems.map((t) => {
          const on = !!t.to && (active === t.to || active.startsWith(t.to + '/'));
          return (
            <Link key={t.label} to={t.to!} className={`te-tab${on ? ' active' : ''}`}>
              <span className="ic">{t.icon}</span>
              <span className="lb">{t.label}</span>
              {t.label === 'Today' && !!todayBadge && todayBadge > 0 && <span className="tdot" />}
            </Link>
          );
        })}
      </nav>
  );
}
