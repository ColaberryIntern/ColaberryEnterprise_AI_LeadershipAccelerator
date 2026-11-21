import { Op } from 'sequelize';
import CommsHubEvent from '../../../models/CommsHubEvent';
import CommsHubMessage from '../../../models/CommsHubMessage';
import { listActivity } from '../activityLog';
import { KIND_LABEL, personLabel } from './labels';

/**
 * The activity log on Schedule & history (CH7.4): the newest hub changes as sentences, "Jackie
 * approved", "Scheduled sender sent". Each row names what it was about (the event title, or the
 * message's event and kind). An action this file does not know is still shown, in its raw words,
 * so a new action never disappears from the log. Read-only.
 */
const VERB: Record<string, string> = {
  'event.created': 'created an event', 'event.updated': 'edited an event', 'event.duplicated': 'duplicated an event',
  'event.cancelled': 'cancelled an event', 'event.plan_set': 'set the promotion plan', 'event.messages_cancelled': 'stopped its messages',
  'event.messages_voided': 'sent its messages back for approval', 'live.prepared': 'prepared the live stream', 'live.went_live': 'went live',
  'broadcast.cancelled': 'cancelled the live stream', 'thumbnail.chosen': 'chose a thumbnail', 'thumbnail.uploaded': 'uploaded a thumbnail',
  'photo.added': 'added a photo', 'photo.removed': 'removed a photo',
  'message.drafted': 'drafted', 'message.redrafted': 'redrafted', 'message.edited': 'edited', 'message.planned': 'planned',
  'message.submitted': 'sent for approval', 'message.approved': 'approved', 'message.rejected': 'rejected', 'message.scheduled': 'scheduled',
  'message.cancelled': 'cancelled', 'message.time_changed': 'changed the send time of', 'message.recipients_changed': 'changed who gets',
  'message.approval_voided': 'sent back for approval', 'message.sending': 'started sending', 'message.retry': 'retried',
  'message.sent': 'sent', 'message.partially_failed': 'partly sent', 'message.failed': 'could not send',
  'sending.paused': 'paused all sending', 'sending.resumed': 'resumed sending', 'settings.changed': 'changed the safety controls',
  'bug.reported': 'reported a problem',
  'registrants.viewed': 'viewed the registrants of', 'registrants.exported': 'downloaded the registrants of',
};

export interface ActivityRow { id: string; at: string; who: string; did: string; about: string | null; entity_type: string; entity_id: string | null }

export async function activityFeed(limit = 20): Promise<ActivityRow[]> {
  const rows = await listActivity(limit);
  const ids = (type: string): string[] => Array.from(new Set(rows.filter((r) => r.entity_type === type && r.entity_id).map((r) => r.entity_id!)));
  const msgs = ids('message').length ? await CommsHubMessage.findAll({ where: { id: { [Op.in]: ids('message') } } }) : [];
  const eventIds = Array.from(new Set([...ids('event'), ...ids('broadcast'), ...msgs.map((m) => m.event_id).filter((x): x is string => !!x)]));
  const events = eventIds.length ? await CommsHubEvent.findAll({ where: { id: { [Op.in]: eventIds } }, attributes: ['id', 'title'] }) : [];
  const eventTitle = new Map(events.map((e) => [e.id, e.title]));
  const msgTitle = new Map(msgs.map((m) => {
    const what = KIND_LABEL[m.kind] ?? 'Message';
    const ev = m.event_id ? eventTitle.get(m.event_id) : undefined;
    return [m.id, ev ? `${ev}: ${what.toLowerCase()}` : (m.subject?.trim() || what)];
  }));
  return rows.map((r) => ({
    id: r.id, at: r.created_at.toISOString(), who: personLabel(r.actor_label) ?? 'Someone',
    did: VERB[r.action] ?? r.action.replace(/[._]/g, ' '),
    about: r.entity_type === 'message' ? msgTitle.get(r.entity_id ?? '') ?? null
      // CH9.3: an Eventbrite event has no hub row; its title travels in the activity detail.
      : r.entity_type === 'eventbrite_event' ? (typeof (r.detail as Record<string, unknown>)?.title === 'string' ? String((r.detail as Record<string, unknown>).title) : null)
        : (r.entity_id ? eventTitle.get(r.entity_id) ?? null : null),
    entity_type: r.entity_type, entity_id: r.entity_id,
  }));
}
