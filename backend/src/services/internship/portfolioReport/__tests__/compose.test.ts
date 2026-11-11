import { composeInternshipPortfolio, firstName, plural, buildQuietDays, emailView, cleanSubject } from '../compose';
import { NOW, collected, rosterRow, daysAgo } from './fixtures';

const one = (data = collected()) => composeInternshipPortfolio(data, { now: NOW }).groups.flatMap((g) => g.interns)[0];

describe('portfolio compose: which project an intern is reported on', () => {
  it('reports an agent builder on the AGENT TAB project, not their newest console project', () => {
    // Prod, 9 Nov: Quincy's newest console project was a finished personal one ("Ambit", 100%);
    // his agent project had 47 of 136 verified. Reporting the console project said "75 days quiet".
    const c = one(collected({
      agentStates: [{ domain: 'platform', agent: 'Ellis', firstName: 'Kalkidan', email: 'kal@example.com', band: 'yellow', daysSinceCommit: 2, verified: 47, stories: 136, overdue: 0, gradeableStories: 136, nextStory: { storyId: 'x.R2', title: 'Safety watch R2', dueOn: null, gradeable: true }, lastVerifiedStoryId: null, recentCommitSubjects: [], daysSinceTheyWrote: 0, awaitingOurReply: false, peersDoneWithNextStory: 0, priorNudgeCount: 0 } as any],
      agentTabs: [{ domain_key: 'platform', agent_id: 'ag1', student_project_id: 'p-agent', intended_builder: 'Kalkidan Bezabeh', project_name: 'Platform Automation', email: 'kal@example.com', subscriptions: null }],
      projects: [{ project_id: 'p-agent', repo_url: 'https://github.com/x/agent', last_sync_at: null, commits: [{ date: daysAgo(2), author: 'kal', message: 'real work' }], recently_verified: [], next_tasks: [], overdue: 0 }],
    }));
    expect(c.track).toBe('agent');
    expect(c.project?.name).toBe('Platform Automation');
    expect(c.project?.pct).toBe(35);
    expect(c.project?.lastCommitDays).toBe(2);
    expect(c.project?.next?.title).toBe('Safety watch R2');
    expect(c.agentTabUrl).toBe('https://enterprise.colaberry.ai/admin/agents/ag1');
  });

  it('reports a gov intern on the pursuit build and links the gov tab', () => {
    const c = one(collected({
      govPursuits: [{ key: 'gws:abc', title: 'Crash Records', stage: 'in_build', decision: 'approved_bid_pursuit', hasActiveIntern: true, assignedInterns: [{ identityId: 'i', name: 'K', email: 'KAL@example.com' }], build: { studentProjectId: 'p-gov', pct: 91, verified: 10, total: 11, studentProjectName: 'x' } } as any],
      projects: [{ project_id: 'p-gov', repo_url: null, last_sync_at: null, commits: [], recently_verified: [{ story_id: 'S', title: 'Done', verified_at: daysAgo(1) }], next_tasks: [], overdue: 0 }],
    }));
    expect(c.track).toBe('gov');
    expect(c.project?.name).toBe('Crash Records');
    expect(c.project?.pct).toBe(91);
    expect(c.govUrl).toContain('gws%3Aabc');
    expect(c.nextSteps.join(' ')).toContain('Close the last 1 story');
  });

  it('puts an intern with no project in "No project yet" and makes it Ali\'s move', () => {
    const r = composeInternshipPortfolio(collected({ roster: [rosterRow({ project: null })], projects: [] }), { now: NOW });
    expect(r.groups.map((g) => g.key)).toEqual(['none']);
    expect(r.aliMoves).toEqual(['Start a project for Kalkidan.']);
    expect(r.groups[0].interns[0].nudge).toMatch(/^Hi Kalkidan, you do not have a project yet/);
  });
});

describe('portfolio compose: status, quiet days and nudge', () => {
  it('counts a verified story as recent work, so a document story is not "quiet"', () => {
    expect(buildQuietDays({ lastCommitDays: 20, lastVerifiedDays: 2 })).toBe(2);
    expect(buildQuietDays({ lastCommitDays: null, lastVerifiedDays: null })).toBeNull();
    expect(buildQuietDays({ lastCommitDays: 4, lastVerifiedDays: null })).toBe(4);
  });

  it('ignores platform bot commits when judging their work', () => {
    const c = one();
    expect(c.project?.commitsRecent.map((x) => x.message)).toEqual(['STORY-1: build it']);
  });

  it('leads the nudge with overdue tasks, and the status gives the reason', () => {
    const data = collected();
    data.projects[0].overdue = 6;
    const c = one(data);
    expect(c.nudge).toMatch(/you have 6 overdue tasks on Console project/);
    expect(c.status.key).toBe('attention');
    expect(c.status.reasons).toContain('6 overdue tasks');
  });

  it('is stalled when the project has had no commits or verified stories for 14 days and the intern is quiet', () => {
    const data = collected({ roster: [rosterRow({ activity: { ...rosterRow().activity, days_since: 5, level: 'orange' } })] });
    data.projects[0].commits = [{ date: daysAgo(30), author: 'kal', message: 'old' }];
    const c = one(data);
    expect(c.status.key).toBe('stalled');
    expect(c.lately).toContain('No commits or verified stories in the last 14 days.');
  });

  it('flags training behind only after the gate should have cleared (day > 28)', () => {
    expect(one().status.reasons.join()).toContain('training behind (weeks 1-3 gate 2/3)');
    expect(one(collected({ roster: [rosterRow({ day: 20 })] })).status.reasons.join()).not.toContain('training behind');
  });

  it('measures the curriculum length from published weeks, not a constant 10', () => {
    expect(one().training.weeksTotal).toBe(12);
  });
});

describe('portfolio compose: email asks and replies owed', () => {
  /**
   * The rule changed on 2026-11-11. It used to be "their latest is newer than anything we sent
   * them", and the second case below asserted that writing to them the same day cleared it. That
   * counted a NUDGE as a reply, so our own nudge run answered every outstanding question in the
   * data without answering one in fact. It is now a thread test: see threadReply.ts, and
   * __tests__/repliesOwed.test.ts for the full set.
   *
   * Note that `last_we_wrote` is the same in both of the first two cases. It is no longer what
   * decides this, which is the whole point.
   */
  it('owes a reply only when we have not written back in THEIR thread, and it is under 7 days old', () => {
    const emails = [{ email: 'kal@example.com', subject: 'Re: Need a read route', snippet: 'please add', received_at: daysAgo(1) }];
    const weWrote = [{ email: 'kal@example.com', last_we_wrote: daysAgo(0) }];
    const nudge = [{ email: 'kal@example.com', subject: 'Two days to your case study package', received_at: daysAgo(0) }];
    const answer = [{ email: 'kal@example.com', subject: 'Re: Need a read route', received_at: daysAgo(0) }];
    expect(emailView('kal@example.com', emails, weWrote, NOW.getTime(), nudge).awaitingReply).toBe(true);
    expect(emailView('kal@example.com', emails, weWrote, NOW.getTime(), answer).awaitingReply).toBe(false);
    const old = [{ ...emails[0], received_at: daysAgo(9) }];
    expect(emailView('kal@example.com', old, [], NOW.getTime(), []).awaitingReply).toBe(false);
  });

  it('collapses Re:/Fwd: threads into one subject each', () => {
    const v = emailView('kal@example.com', [
      { email: 'kal@example.com', subject: 'Re: Access', snippet: '', received_at: daysAgo(1) },
      { email: 'kal@example.com', subject: 'Access', snippet: '', received_at: daysAgo(2) },
    ], [], NOW.getTime());
    expect(v.threads.map((t) => t.subject)).toEqual(['Access']);
    expect(v.count).toBe(2);
  });

  it('never reports the operator account, and leaves it out of every count', () => {
    const r = composeInternshipPortfolio(collected({ roster: [rosterRow(), rosterRow({ enrollment_id: 'e2', name: 'Ali Muwwakkil', email: 'ali@colaberry.com' })] }), { now: NOW });
    expect(r.totals.interns).toBe(1);
    expect(r.operatorsExcluded).toEqual(['Ali Muwwakkil']);
  });
});

describe('portfolio compose: boundaries and determinism', () => {
  it('an empty roster gives an empty report, not a crash', () => {
    const r = composeInternshipPortfolio(collected({ roster: [], projects: [] }), { now: NOW });
    expect(r.groups).toEqual([]);
    expect(r.totals.interns).toBe(0);
  });

  it('is deterministic: composing the same facts twice gives the same report', () => {
    const data = collected();
    expect(composeInternshipPortfolio(data, { now: NOW })).toEqual(composeInternshipPortfolio(data, { now: NOW }));
  });

  it('names and plurals read right', () => {
    expect(firstName('OBI, ANAMELECHI. K')).toBe('Anamelechi');
    expect(firstName('SAmrawit mekonen')).toBe('Samrawit');
    expect(plural(1, 'story')).toBe('1 story');
    expect(plural(4, 'story')).toBe('4 stories');
    expect(cleanSubject('Re: Fwd: Hi')).toBe('Hi');
    expect(cleanSubject(null)).toBe('(no subject)');
  });
});
