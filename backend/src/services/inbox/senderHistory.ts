/**
 * Tracks how often a sender has emailed before. Used to penalize first-time
 * senders (a strong cold-outreach signal) without paying for an LLM round-trip.
 */
import { Op } from 'sequelize';
import InboxEmail from '../../models/InboxEmail';

const LOG_PREFIX = '[InboxCOS][SenderHistory]';

/**
 * Returns the number of prior emails from this sender, EXCLUDING the email
 * currently being classified (which is already in `inbox_emails` by the time
 * the classifier runs). Case-insensitive on the address.
 *
 * Returns 0 on DB error so a transient failure never falsely promotes a
 * first-time sender to "known".
 */
export async function countPriorEmailsFromSender(
  fromAddress: string,
  currentEmailId: string
): Promise<number> {
  try {
    const fromLower = fromAddress.toLowerCase();
    const count = await InboxEmail.count({
      where: InboxEmail.sequelize!.and(
        InboxEmail.sequelize!.where(
          InboxEmail.sequelize!.fn('LOWER', InboxEmail.sequelize!.col('from_address')),
          fromLower
        ),
        { id: { [Op.ne]: currentEmailId } } as any
      ),
    });
    return count;
  } catch (error: any) {
    console.error(`${LOG_PREFIX} Count failed for ${fromAddress}: ${error.message}`);
    return 0;
  }
}
