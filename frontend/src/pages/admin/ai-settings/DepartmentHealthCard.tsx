import React from 'react';

/**
 * Department health, as the COO dashboard shows it.
 *
 * Extracted from CoryCOOTab.tsx on 2026-10-06: that file was already 518 lines,
 * past this repo's 500-line hard ceiling, and CLAUDE.md requires the next
 * change to an oversize file to split it rather than add to it.
 *
 * The backend verdict is three-state - 'healthy' | 'degraded' | 'unknown', from
 * backend/src/services/briefings/departmentHealthVerdict.ts - and this card
 * used to style it with
 *
 *     dept.health === 'healthy' ? 'text-success' : 'text-warning'
 *
 * which is two cases for three states, with nothing on screen distinguishing
 * "this department is in trouble" from "nobody can see this department". The
 * same dashboard showed "Content Engine - healthy - 0 agents": the number that
 * proved the supervisor saw nothing, printed beside the word healthy.
 */
export interface DepartmentHealth {
  name: string;
  /** 'healthy' | 'degraded' | 'unknown'. Typed as string because it arrives over HTTP. */
  health: string;
  /** null when the department's own report carried no readable agent count. */
  agent_count: number | null;
  last_report_at: string | null;
}

/**
 * Anything unrecognised resolves to the 'unknown' row, never the green one: a
 * verdict string this UI does not understand is not evidence of health.
 */
const HEALTH_DISPLAY: Record<string, { dot: string; className: string; label: string; badge: string }> = {
  healthy: { dot: '●', className: 'text-success', label: 'healthy', badge: 'bg-success-subtle text-success-emphasis' },
  degraded: { dot: '▲', className: 'text-warning', label: 'degraded', badge: 'bg-warning-subtle text-warning-emphasis' },
  // 'unknown' covers three causes - no agents registered, the status read
  // failed, or the last report is four 30-minute cycles old - so the label says
  // "unknown" rather than guessing which one it is.
  unknown: { dot: '○', className: 'text-secondary', label: 'unknown', badge: 'bg-secondary-subtle text-secondary-emphasis' },
};

function healthDisplay(health: string) {
  return HEALTH_DISPLAY[health] || HEALTH_DISPLAY.unknown;
}

/**
 * The three buckets, counted in one place.
 *
 * `unknown` is everything that is not one of the two known verdicts, so a
 * department can never fall out of all three counts and leave the summary row
 * quietly under-reporting the fleet - the same "no news reads as good news"
 * failure one level up.
 */
export function departmentHealthCounts(departments: DepartmentHealth[]) {
  return {
    healthy: departments.filter((d) => d.health === 'healthy').length,
    degraded: departments.filter((d) => d.health === 'degraded').length,
    unknown: departments.filter((d) => d.health !== 'healthy' && d.health !== 'degraded').length,
  };
}

export default function DepartmentHealthCard({ departments }: { departments: DepartmentHealth[] }) {
  return (
    <div className="card border-0 shadow-sm">
      <div className="card-header bg-white fw-semibold">Department Health</div>
      <div className="card-body p-0">
        {departments.length === 0 ? (
          <div className="p-3 text-muted text-center small">No department reports yet</div>
        ) : (
          <div className="list-group list-group-flush">
            {departments.map((dept) => {
              const display = healthDisplay(dept.health);
              return (
                <div key={dept.name} className="list-group-item d-flex justify-content-between align-items-center">
                  <div>
                    <span className={`me-2 ${display.className}`} style={{ fontSize: '0.75rem' }} aria-hidden="true">
                      {display.dot}
                    </span>
                    <span className="small fw-medium">{dept.name}</span>
                    {/* The verdict in words, not only in colour: a grey dot on
                        its own is a colour-only signal (WCAG 1.4.1) and reads
                        as "fine" at a glance. */}
                    <span className={`badge ms-2 fw-normal ${display.badge}`}>{display.label}</span>
                  </div>
                  {/* A dash, not 0: "0 agents" beside a verdict is a claim, and
                      an unreadable report does not support it. */}
                  <span className="badge bg-light text-dark">
                    {dept.agent_count === null || dept.agent_count === undefined ? '—' : dept.agent_count} agents
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
