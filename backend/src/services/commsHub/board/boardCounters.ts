import { Op } from 'sequelize';
import CommsHubMessage from '../../../models/CommsHubMessage';
import CommsHubSettings from '../../../models/CommsHubSettings';
import { registerSummaryCounters } from '../commsHubSummary';

/**
 * The Today tiles that messages and settings own (CH7.4), registered when the board routes load:
 * waiting for approval, approved messages due in the next 7 days, messages that did not fully go out
 * (until someone retries or they are cancelled), and the pause. Each is one indexed COUNT.
 */
const WEEK_MS = 7 * 24 * 3600 * 1000;

registerSummaryCounters({
  awaitingApproval: () => CommsHubMessage.count({ where: { status: 'needs_approval' } }),
  scheduledNext7Days: (now) => CommsHubMessage.count({
    where: { status: { [Op.in]: ['approved', 'scheduled', 'sending'] }, [Op.or]: [{ send_at: { [Op.is]: null } }, { send_at: { [Op.lte]: new Date(now.getTime() + WEEK_MS) } }] },
  }),
  needsAttention: () => CommsHubMessage.count({ where: { status: { [Op.in]: ['partially_failed', 'failed'] } } }),
  sendingPaused: async () => !!(await CommsHubSettings.findByPk(1, { attributes: ['sending_paused'] }))?.sending_paused,
});

export {};
