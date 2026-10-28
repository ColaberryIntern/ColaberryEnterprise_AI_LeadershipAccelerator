import { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

export interface MgmtStatus {
  is_mgmt: boolean;
  role: string | null;
  label: string | null;
  /** Campus HQ (H2): the admin sections this person's admin token is scoped to. Empty when not mgmt. */
  sections: string[];
}

const NOT_MGMT: MgmtStatus = { is_mgmt: false, role: null, label: null, sections: [] };

/**
 * Whether the signed-in student is an employee with a management role — drives
 * the "Management Portal" link in the portal shell. Backed by
 * GET /api/portal/mgmt/status. Fail-soft: any error reads as "not mgmt".
 * `canSection` answers from the same `sections` list (an older server without it reads as no sections).
 */
export function useMgmtStatus(): MgmtStatus & { canSection: (s: string) => boolean } {
  const [status, setStatus] = useState<MgmtStatus>(NOT_MGMT);
  useEffect(() => {
    let live = true;
    portalApi.get<Partial<MgmtStatus>>('/api/portal/mgmt/status')
      .then((r) => { if (live) setStatus({ ...NOT_MGMT, ...r.data, sections: Array.isArray(r.data?.sections) ? r.data.sections : [] }); })
      .catch(() => { /* not mgmt / offline — leave default */ });
    return () => { live = false; };
  }, []);
  return { ...status, canSection: (s: string) => status.sections.includes(s) };
}
