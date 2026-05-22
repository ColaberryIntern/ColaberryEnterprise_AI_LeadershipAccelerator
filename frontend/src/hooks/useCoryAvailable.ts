/**
 * useCoryAvailable — single source of truth for "can this operator reach Cory?"
 *
 * The Cory floating widget (GlobalCoryWidget) is currently gated to
 * ali@colaberry.com and super_admin accounts. Any surface that offers a
 * Cory deeplink (chip, link, button that dispatches `cory:ask`) needs to
 * honour the same gate — otherwise non-authorized operators see UI that
 * silently no-ops when clicked.
 *
 * Consumers:
 *   - GlobalCoryWidget itself (early-returns null when false)
 *   - BPDetailV2 education chip strip + "Ask Cory about this step" links
 *   - Any future surface that wires up useCoryAsk()
 *
 * Returns `false` while the admin user is still loading (the first paint
 * after navigation): better to flash-hide a chip than to flash-show a
 * dead link the operator can click before the gate resolves.
 */
import { useAdminUser } from './useAdminUser';

export function useCoryAvailable(): boolean {
  const adminUser = useAdminUser();
  if (!adminUser) return false;
  return adminUser.email === 'ali@colaberry.com' || adminUser.role === 'super_admin';
}
