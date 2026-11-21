/**
 * enterpriseIntakeMeetingPost - the booked meeting on the client's Basecamp list (v2).
 *
 * When the client books their meeting with Ali, the list gets one comment with the time
 * (Central) and the Google Meet link, and the checklist step "Book the scoping meeting" is ticked.
 *
 * Once-only: an atomic claim on bc_meeting_posted_at that also counts the attempt. A failed post
 * releases the claim; after MAX_MEETING_POST_ATTEMPTS it is dead-lettered. The tick is best effort
 * (the team can tick it by hand); a failed tick is logged.
 */
import { Op } from 'sequelize';
import EnterpriseIntake from '../../models/EnterpriseIntake';
import { bcPost } from '../ops/basecampClient';
import { env } from '../../config/env';
import { esc, intakeBasecampEnabled, tickStep } from './enterpriseIntakeBasecamp';
import { meetingWhen } from './enterpriseIntakeTime';

export const MAX_MEETING_POST_ATTEMPTS = 5;

const log = (event: string, outcome: 'success' | 'failure', context: Record<string, unknown>, error_class?: string) =>
  (outcome === 'failure' ? console.error : console.log)(JSON.stringify({
    level: outcome === 'failure' ? 'error' : 'info', service: 'enterprise-intake-meeting-post', event, outcome, ...(error_class ? { error_class } : {}), context,
  }));

export function meetingCommentHtml(i: Pick<EnterpriseIntake, 'meeting_start' | 'meeting_link' | 'interviewed_at' | 'interview_mode' | 'interview_scheduled_for'>): string {
  const interview = i.interviewed_at
    ? 'The AI interview is done.'
    : i.interview_mode === 'later' && i.interview_scheduled_for
      ? `The AI interview is scheduled for ${meetingWhen(new Date(i.interview_scheduled_for))}.`
      : 'The AI interview is not done yet.';
  return [
    `<div><strong>Meeting with Ali booked by the client:</strong> ${esc(meetingWhen(new Date(i.meeting_start!)))}, 30 minutes, on Ali's calendar.</div>`,
    i.meeting_link ? `<div>Google Meet: <a href="${esc(i.meeting_link)}">${esc(i.meeting_link)}</a></div>` : '<div>No Meet link was created; the invite has the details.</div>',
    `<div>${esc(interview)}</div>`,
  ].join('');
}

export async function postMeetingToList(intakeId: string): Promise<'posted' | 'off' | 'missing' | 'not_ready' | 'done' | 'failed'> {
  if (!intakeBasecampEnabled()) return 'off';
  const i = await EnterpriseIntake.findByPk(intakeId);
  if (!i) return 'missing';
  const attempts = i.bc_meeting_attempts || 0;
  if (i.bc_meeting_posted_at || attempts >= MAX_MEETING_POST_ATTEMPTS) return 'done';
  if (!i.meeting_start || !i.bc_todolist_id || !i.bc_checklist_ready_at) return 'not_ready';

  const [n] = await EnterpriseIntake.update(
    { bc_meeting_posted_at: new Date(), bc_meeting_attempts: attempts + 1 } as Partial<EnterpriseIntake>,
    { where: { id: i.id, bc_meeting_posted_at: null, bc_meeting_attempts: attempts } as Record<string, unknown> },
  );
  if (n !== 1) return 'done';

  const project = env.enterpriseIntakeBcProjectId;
  try {
    await bcPost(`/buckets/${project}/recordings/${i.bc_todolist_id}/comments.json`, { content: meetingCommentHtml(i) });
  } catch (err) {
    await EnterpriseIntake.update({ bc_meeting_posted_at: null } as Partial<EnterpriseIntake>, { where: { id: i.id } as Record<string, unknown> })
      .catch((x) => log('enterprise_meeting_post_release_failed', 'failure', { intake_id: i.id, message: String((x as Error)?.message || x).slice(0, 200) }, 'UpstreamUnavailable'));
    const dead = attempts + 1 >= MAX_MEETING_POST_ATTEMPTS;
    log(dead ? 'enterprise_intake_dead_letter' : 'enterprise_meeting_post_failed', 'failure', {
      intake_id: i.id, step: 'basecamp_meeting', attempt: attempts + 1, message: String((err as Error)?.message || err).slice(0, 200),
    }, (err as { error_class?: string })?.error_class || 'UpstreamUnavailable');
    return 'failed';
  }
  try {
    await tickStep(project, i.bc_todolist_id, 'meeting');
  } catch (err) {
    log('enterprise_meeting_tick_failed', 'failure', { intake_id: i.id, message: String((err as Error)?.message || err).slice(0, 200) }, 'UpstreamUnavailable');
  }
  log('enterprise_meeting_posted', 'success', { intake_id: i.id });
  return 'posted';
}

/** Sweep: booked meetings not yet on their list. */
export async function syncMeetingPosts(limit = 20): Promise<{ posted: number; failed: number }> {
  if (!intakeBasecampEnabled()) return { posted: 0, failed: 0 };
  const rows = await EnterpriseIntake.findAll({
    where: {
      meeting_start: { [Op.ne]: null },
      bc_meeting_posted_at: null,
      bc_meeting_attempts: { [Op.lt]: MAX_MEETING_POST_ATTEMPTS },
      bc_todolist_id: { [Op.ne]: null },
    } as Record<string, unknown>,
    attributes: ['id'],
    limit,
  });
  const out = { posted: 0, failed: 0 };
  for (const r of rows) {
    const s = await postMeetingToList(r.id);
    if (s === 'posted') out.posted++;
    else if (s === 'failed') out.failed++;
  }
  return out;
}

export function postMeetingSoon(intakeId: string): void {
  postMeetingToList(intakeId).catch((err) => log('enterprise_meeting_post_failed', 'failure', { intake_id: intakeId, message: String(err?.message || err).slice(0, 200) }, 'UpstreamUnavailable'));
}
