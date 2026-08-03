import React from 'react';

// ProofDesk Milestone 2 — Work Graph tab (spec §15.3). Static, honest placeholder.
// The real Work Graph (ticket_work_units, work_unit_dependencies, resource_leases,
// the Capability Router) is explicitly out of scope for this milestone — it ships in
// Milestone 3 (Multi-Agent Work Graph). No data fetching here on purpose: there is
// nothing yet to fetch, and pretending otherwise would be the same fabrication this
// milestone's summary generator (T004) was built to prevent, just in the UI layer.

export default function WorkGraphTab() {
  return (
    <div className="text-muted small py-4">
      Work Graph is coming in a future milestone (Milestone 3 — Multi-Agent Work Graph).
    </div>
  );
}
