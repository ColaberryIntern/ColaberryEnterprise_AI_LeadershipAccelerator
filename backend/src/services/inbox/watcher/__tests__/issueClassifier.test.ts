import { classifyInbound, extractStudentText } from '../issueClassifier';

/**
 * The watcher answers four specific problems and sends everything else to a
 * human. These tests pin both halves: that the four are recognised, and that
 * the things which must never be answered autonomously are not, including when
 * they arrive wrapped in a question the watcher does know how to answer.
 */

const from = 'bfglz@yahoo.com';

describe('the four bounded issue classes', () => {
  it('recognises an expired sign-in link', () => {
    const c = classifyInbound({ fromAddress: from, subject: 'help', bodyText: 'The link has expired again.' });
    expect(c).toEqual({ action: 'auto_reply', issueClass: 'login_link', matched: 'link has expired' });
  });

  it('recognises "I cannot log in"', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'I still cant log in to the portal.' });
    expect(c.action).toBe('auto_reply');
    expect(c.action === 'auto_reply' && c.issueClass).toBe('login_link');
  });

  it('recognises repo connect trouble', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'How do I connect my github?' });
    expect(c.action === 'auto_reply' && c.issueClass).toBe('repo_connect');
  });

  it('recognises a webhook that is not firing', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'The webhook does not seem to run.' });
    expect(c.action === 'auto_reply' && c.issueClass).toBe('webhook_not_firing');
  });

  it('recognises a project-state question', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'I do not see STORY-000 anywhere.' });
    expect(c.action === 'auto_reply' && c.issueClass).toBe('project_state');
  });
});

describe('an unclassifiable message escalates rather than getting a generic answer', () => {
  it('escalates a plain thank-you', () => {
    const c = classifyInbound({ fromAddress: from, subject: 'thanks', bodyText: 'Thanks Ali, appreciated.' });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('unclassifiable');
  });

  it('escalates a question about class timings, which is answerable but not by this watcher', () => {
    const c = classifyInbound({
      fromAddress: from, subject: '', bodyText: 'What time is the Tuesday session and will it be recorded?',
    });
    expect(c.action === 'escalate' && c.reason).toBe('unclassifiable');
  });

  it('escalates an empty message', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: '' });
    expect(c.action === 'escalate' && c.reason).toBe('unclassifiable');
  });

  it('escalates when two issue classes match, rather than answering the easier one', () => {
    const c = classifyInbound({
      fromAddress: from, subject: '',
      bodyText: 'My sign in link has expired and also the webhook is not firing.',
    });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('multiple_issue_classes');
  });
});

describe('money and enrollment status always escalate, and outrank a class that matched', () => {
  it('escalates a refund request', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'I would like a refund please.' });
    expect(c.action === 'escalate' && c.reason).toBe('refund_withdraw_cancel');
  });

  it('escalates a billing question', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'I was charged twice this month.' });
    expect(c.action === 'escalate' && c.reason).toBe('money_or_billing');
  });

  it('escalates "my link expired AND I want to cancel" instead of answering the link half', () => {
    const c = classifyInbound({
      fromAddress: from, subject: '',
      bodyText: 'My sign in link has expired. Honestly I want to cancel and get my money back.',
    });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('refund_withdraw_cancel');
  });

  it('escalates a withdrawal', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'I need to withdraw from the program.' });
    expect(c.action === 'escalate' && c.reason).toBe('refund_withdraw_cancel');
  });
});

describe('anything that would remove or rewrite student work escalates', () => {
  it('escalates a request to delete lists', () => {
    const c = classifyInbound({ fromAddress: from, subject: '', bodyText: 'Please delete the extra task lists.' });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('protected_student_work');
  });

  it('names protected_student_work for Quincy, who holds hand-ticked completions', () => {
    const c = classifyInbound({
      fromAddress: 'qninying@gmail.com', subject: '', bodyText: 'Can you regenerate my plan?',
    });
    expect(c.action === 'escalate' && c.reason).toBe('protected_student_work');
  });

  it('names destructive_to_student_work for a student with no protected completions', () => {
    const c = classifyInbound({
      fromAddress: 'pam.manyika@gmail.com', subject: '', bodyText: 'Can I start over from scratch?',
    });
    expect(c.action === 'escalate' && c.reason).toBe('destructive_to_student_work');
  });

  it('escalates a reset request even when it arrives with a login complaint', () => {
    const c = classifyInbound({
      fromAddress: 'pam.manyika@gmail.com', subject: '',
      bodyText: 'I cannot log in. Can you just reset my account?',
    });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('destructive_to_student_work');
  });
});

describe('our own words are never read as the student\'s problem', () => {
  // 12 of the 25 campaign subjects end in "and a fresh sign in link", and every
  // reply carries that subject back. This is the bug the cycle test caught.
  const CAMPAIGN_SUBJECT = 'Re: Your MeshMedic build, and a fresh sign in link';

  it('escalates a bare thank-you replying to a campaign email about sign in links', () => {
    const c = classifyInbound({
      fromAddress: from, subject: CAMPAIGN_SUBJECT, bodyText: 'Thanks Ali, appreciate the update.',
    });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('unclassifiable');
  });

  it('ignores our quoted email below a Gmail reply marker', () => {
    const c = classifyInbound({
      fromAddress: from, subject: CAMPAIGN_SUBJECT,
      bodyText: [
        'Got it, thank you.',
        '',
        'On Sun, Aug 17, 2026 at 2:05 AM Ali Muwwakkil <ali@colaberry.com> wrote:',
        '> Request a fresh sign in link at /portal/login.',
        '> Then connect your github repository.',
      ].join('\n'),
    });
    expect(c.action === 'escalate' && c.reason).toBe('unclassifiable');
  });

  it('still reads the student\'s own sentence above the quote', () => {
    const c = classifyInbound({
      fromAddress: from, subject: CAMPAIGN_SUBJECT,
      bodyText: [
        'I tried but the link has expired again.',
        '',
        'On Sun, Aug 17, 2026 at 2:05 AM Ali Muwwakkil <ali@colaberry.com> wrote:',
        '> Anything ticked stays ticked.',
      ].join('\n'),
    });
    expect(c.action === 'auto_reply' && c.issueClass).toBe('login_link');
  });

  it('uses the subject when the student chose it themselves', () => {
    const c = classifyInbound({
      fromAddress: from, subject: 'cannot log in', bodyText: 'see subject',
    });
    expect(c.action === 'auto_reply' && c.issueClass).toBe('login_link');
  });
});

describe('extractStudentText', () => {
  it('drops an echoed Re: subject and keeps a self-chosen one', () => {
    expect(extractStudentText('Re: a fresh sign in link', 'thanks')).toBe('\nthanks');
    expect(extractStudentText('a fresh sign in link', 'thanks')).toBe('a fresh sign in link\nthanks');
  });

  it('cuts at an Outlook divider', () => {
    expect(extractStudentText(null, 'ok thanks\n____________________\nFrom: Ali\nsign in link'))
      .toBe('\nok thanks\n');
  });

  it('cuts at an Original Message divider', () => {
    expect(extractStudentText(null, 'ok\n-----Original Message-----\nsign in link')).toBe('\nok\n');
  });
});

describe('the three people the watcher never answers', () => {
  it('escalates anything from Ikenna, whatever it says', () => {
    const c = classifyInbound({
      fromAddress: 'nzeribeikenna@gmail.com', subject: '', bodyText: 'My sign in link has expired.',
    });
    expect(c.action).toBe('escalate');
    expect(c.action === 'escalate' && c.reason).toBe('ikenna');
  });

  it('escalates both of Marione\'s addresses', () => {
    for (const addr of ['rogation2000.mn@gmail.com', 'rogation2000@yahoo.fr']) {
      const c = classifyInbound({ fromAddress: addr, subject: '', bodyText: 'I cannot log in.' });
      expect(c.action === 'escalate' && c.reason).toBe('marione_account_merge');
    }
  });

  it('still escalates Ikenna when his address carries a display name and different case', () => {
    const c = classifyInbound({
      fromAddress: 'Ikenna Nzeribe <NzeribeIkenna@gmail.com>', subject: '', bodyText: 'hello',
    });
    expect(c.action === 'escalate' && c.reason).toBe('ikenna');
  });
});
