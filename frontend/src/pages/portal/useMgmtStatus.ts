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
 *
 * `loading` is true until the request settles, either way. AF12.18: the default state and the
 * answer "they are not management" are the SAME object, so a caller that renders the default is
 * stating something it has not read yet. That is fine for a nav item, which simply appears a
 * moment later, and not fine for the view-as access panel, whose entire job is to say what
 * someone can reach. A panel cannot tell the truth about a value it does not have yet, so it is
 * told which of the two it is holding.
 */
export function useMgmtStatus(): MgmtStatus & { canSection: (s: string) => boolean; loading: boolean } {
  const [status, setStatus] = useState<MgmtStatus>(NOT_MGMT);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    portalApi.get<Partial<MgmtStatus>>('/api/portal/mgmt/status')
      .then((r) => { if (live) setStatus({ ...NOT_MGMT, ...r.data, sections: Array.isArray(r.data?.sections) ? r.data.sections : [] }); })
      .catch(() => { /* not mgmt / offline — leave default */ })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  return { ...status, canSection: (s: string) => status.sections.includes(s), loading };
}
