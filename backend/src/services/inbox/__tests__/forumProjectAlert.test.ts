/**
 * Rule 3.4b: school forum "New Project Alert" broadcasts are archived every
 * time, instead of the four-way coin flip the LLM was giving them (77 hold /
 * 20 archive / 19 ask / 7 inbox in the 30 days to 2026-11-23).
 */
jest.mock('../../../models/InboxVip', () => ({
  findOne: jest.fn(),
  sequelize: {
    where: (...args: any[]) => ({ __where: args }),
    fn: (...args: any[]) => ({ __fn: args }),
    col: (...args: any[]) => ({ __col: args }),
  },
}));
jest.mock('../../../models/InboxRule', () => ({ findAll: jest.fn() }));
jest.mock('../senderHistory', () => ({ countPriorEmailsFromSender: jest.fn() }));

import { evaluateHardRules, isForumProjectAlert } from '../hardRuleEngine';
import InboxVip from '../../../models/InboxVip';
import InboxRule from '../../../models/InboxRule';

const findOneVip = InboxVip.findOne as jest.Mock;
const findAllRules = InboxRule.findAll as jest.Mock;
const FORUM = 'discussions@school.colaberry.com';

function forumEmail(overrides: Record<string, any> = {}) {
  return {
    id: 'email-forum',
    from_address: FORUM,
    from_name: 'Colaberry School',
    to_addresses: ['ali@colaberry.com'],
    cc_addresses: [],
    subject: 'New Project Alert - Subsidized Housing in US - Tableau Dashboard',
    body_text: 'A new project has been posted.',
    headers: {}, // no List-Unsubscribe: the case that used to reach the LLM
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  findOneVip.mockResolvedValue(null);
  findAllRules.mockResolvedValue([]);
});

describe('isForumProjectAlert', () => {
  it('matches real broadcast subjects from the forum sender', () => {
    expect(isForumProjectAlert(FORUM, 'New Project Alert - IPBC Signups')).toBe(true);
    expect(isForumProjectAlert(FORUM, 'New Project Alert - Colaberry Job Referral - Power BI')).toBe(true);
    expect(isForumProjectAlert('Discussions@School.Colaberry.com', '  new project alert - x')).toBe(true);
  });

  it('leaves the forum sender\'s other mail to the classifier', () => {
    expect(isForumProjectAlert(FORUM, 'Comment Added')).toBe(false);
    expect(isForumProjectAlert(FORUM, 'Your Session has been Approved')).toBe(false);
    expect(isForumProjectAlert(FORUM, 'PowerBIReporting')).toBe(false);
    expect(isForumProjectAlert(FORUM, 'Re: New Project Alert - IPBC Signups')).toBe(false);
  });

  it('does not match the same subject from any other sender', () => {
    expect(isForumProjectAlert('student@gmail.com', 'New Project Alert - my idea')).toBe(false);
    expect(isForumProjectAlert('other@school.colaberry.com', 'New Project Alert - x')).toBe(false);
    expect(isForumProjectAlert('discussions@school.colaberry.com.evil.io', 'New Project Alert - x')).toBe(false);
  });

  it('handles empty and missing input', () => {
    expect(isForumProjectAlert(null, null)).toBe(false);
    expect(isForumProjectAlert(FORUM, '')).toBe(false);
    expect(isForumProjectAlert('', 'New Project Alert - x')).toBe(false);
  });
});

describe('evaluateHardRules: forum project alerts (forum_project_alert_34b)', () => {
  it('archives a broadcast that has no List-Unsubscribe header', async () => {
    const r = await evaluateHardRules(forumEmail());
    expect(r).toMatchObject({ matched: true, state: 'AUTOMATION', rule_id: 'forum_project_alert_34b' });
  });

  it('gives identical broadcasts the identical verdict (idempotent)', async () => {
    const a = await evaluateHardRules(forumEmail());
    const b = await evaluateHardRules(forumEmail({ id: 'email-forum-2' }));
    expect(a).toEqual(b);
  });

  it('a VIP sender still wins over the forum rule', async () => {
    findOneVip.mockResolvedValue({ name: 'Forum VIP', email_address: FORUM });
    const r = await evaluateHardRules(forumEmail());
    expect(r.state).toBe('INBOX');
  });

  it('a forum comment is not caught by this rule', async () => {
    const r = await evaluateHardRules(forumEmail({ subject: 'Comment Added' }));
    expect(r.rule_id).not.toBe('forum_project_alert_34b');
  });
});
