/**
 * recordedHumans — is this email a person we hold a record of?
 *
 * ## Why this is its own module as of AF11.0
 *
 * It lived in `agentChangeRequestService.ts` and was the only thing AF11.0's confirmation service
 * needed from there. Importing that service to get it failed a deliberate architectural pin:
 * `agentChangeRequestNoTrigger.test.ts` allows exactly two importers, and its header says why —
 * AF4.2's fourth criterion is that no build is triggered by an approval, and *"a new
 * `agentChangeRequestBuildBridge.ts` importing the service and acting on approvals would leave
 * every assertion above green"*.
 *
 * That pin is right and the allowlist was not widened to get around it. A roster lookup is not
 * change-request logic; it was simply living in the first module that needed it. So it moved here,
 * both callers import it from one place, and the pin keeps meaning what it meant.
 *
 * `agentChangeRequestService` re-exports it, so every existing caller and test is untouched.
 */

import { QueryTypes, type Sequelize } from 'sequelize';
import { AGENT_DOMAIN_ORG_ID } from './agentDomainRegistry';

/**
 * Is this email a person we have a record of?
 *
 * This is the ALLOWLIST half of the humanity check, and it has to be a positive lookup against
 * records we keep, because a denylist cannot establish humanity: `isNonHumanIdentity` returns
 * false for `'unknown'` and false for `'auto-approval'`, which is one letter off the real
 * production timer identity.
 *
 * Both tables are consulted on purpose. An intern is an `org_members` row in the agent-domain org;
 * Ali is an `admin_users` row. Checking only one would have silently excluded whichever group it
 * left out — and since the decide route is admin-gated, checking only `org_members` would have made
 * approval impossible for the one person the ticket names as the approver.
 */
export async function resolveRecordedHumans(
  sequelize: Sequelize,
  email: string,
): Promise<string[]> {
  const trimmed = (email || '').trim();
  if (!trimmed) return [];
  const rows = await sequelize.query<{ email: string }>(
    `SELECT au.email AS email FROM admin_users au WHERE lower(au.email) = lower($1)
      UNION
     SELECT om.email AS email
       FROM org_members om
       LEFT JOIN enrollments e ON e.id = om.enrollment_id
      WHERE om.org_id = $2
        AND (lower(om.email) = lower($1) OR lower(e.email) = lower($1))`,
    { bind: [trimmed, AGENT_DOMAIN_ORG_ID], type: QueryTypes.SELECT },
  );
  // The acting email is what the gate compares, so return THAT rather than the stored spelling:
  // a record existing is the fact being established, not how the record happens to be cased.
  return rows.length > 0 ? [trimmed] : [];
}
