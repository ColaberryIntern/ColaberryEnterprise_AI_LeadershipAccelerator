import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import CommsHubEvent from '../../../models/CommsHubEvent';
import { ConnectorPermanentError } from '../connectors/types';
import { listRegistrants } from './registrants';

/**
 * The people an "event registrants" message reaches in the app (CH9.6): the registrants of one
 * managed Eventbrite event (CH9.3's list) who are on the platform, meaning an active, portal-enabled
 * enrollment that has a community profile (the same rule the in-app connector applies to a cohort).
 * Registrants without an account are not reached here; the organizer sees how many before approving.
 *
 * FAILURE. Not a managed event: ConnectorPermanentError (the delivery fails, it will never work).
 * Eventbrite unreadable at send time: RegistrantsUnavailableError, which the worker RETRIES (it is not
 * permanent), and after its last try the delivery fails and the failure alert goes out. It never sends
 * to the part of the list it could read: a reminder that reaches half the people looks like it worked.
 */
export class RegistrantsUnavailableError extends Error {
  constructor() { super('The Eventbrite registrant list is unavailable right now; this send will be retried.'); this.name = 'UpstreamUnavailable'; }
}

async function managedEvent(hubEventId: string): Promise<CommsHubEvent> {
  const e = await CommsHubEvent.findByPk(hubEventId, { attributes: ['id', 'ccpp_event_id', 'title'] });
  if (!e || !e.ccpp_event_id) throw new ConnectorPermanentError('That event is not an Eventbrite event managed in the hub.', 'not_managed');
  return e;
}

/** Enrollment ids (with a community profile) among these emails. Lowercased, trimmed match. */
async function reachableEnrollmentIds(emails: string[]): Promise<string[]> {
  if (emails.length === 0) return [];
  const rows = await sequelize.query<{ id: string }>(
    `SELECT DISTINCT e.id FROM enrollments e
       JOIN community_members m ON m.enrollment_id = e.id
      WHERE LOWER(TRIM(e.email)) IN (:emails) AND e.status = 'active' AND e.portal_enabled = true`,
    { replacements: { emails }, type: QueryTypes.SELECT },
  );
  return rows.map((r) => r.id);
}

/** For the connector: who to notify. Throws rather than return a partial list. */
export async function registrantEnrollmentIds(hubEventId: string): Promise<string[]> {
  const e = await managedEvent(hubEventId);
  const list = await listRegistrants(String(e.ccpp_event_id));
  // Not connected on this server is permanent (retrying cannot fix it); unreadable right now is retried.
  if (list.eventbrite === 'not_configured') throw new ConnectorPermanentError('Eventbrite is not connected on this server, so registrants cannot be reached.', 'not_configured');
  if (list.eventbrite !== 'ok') throw new RegistrantsUnavailableError();
  return reachableEnrollmentIds(list.rows.map((r) => r.email));
}

export interface RegistrantReach { registrants: number; reachable: number; eventbrite: 'ok' | 'unavailable' | 'not_configured' }

/** For Compose, before approval: "N of M registrants have platform accounts". Never throws on Eventbrite. */
export async function registrantReach(hubEventId: string): Promise<RegistrantReach> {
  const e = await managedEvent(hubEventId);
  const list = await listRegistrants(String(e.ccpp_event_id));
  return { registrants: list.rows.length, reachable: (await reachableEnrollmentIds(list.rows.map((r) => r.email))).length, eventbrite: list.eventbrite };
}
