import { useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';

export interface MgmtStatus {
  is_mgmt: boolean;
  role: string | null;
  label: string | null;
}

/**
 * Whether the signed-in student is an employee with a management role — drives
 * the "Management Portal" link in the portal shell. Backed by
 * GET /api/portal/mgmt/status. Fail-soft: any error reads as "not mgmt".
 */
export function useMgmtStatus(): MgmtStatus {
  const [status, setStatus] = useState<MgmtStatus>({ is_mgmt: false, role: null, label: null });
  useEffect(() => {
    let live = true;
    portalApi.get<MgmtStatus>('/api/portal/mgmt/status')
      .then((r) => { if (live) setStatus(r.data); })
      .catch(() => { /* not mgmt / offline — leave default */ });
    return () => { live = false; };
  }, []);
  return status;
}
