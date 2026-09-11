/**
 * The Community Discussion drawer has to do two things: SHOW the thread and let
 * the student REPLY to it. Before this panel it did neither — opening a
 * classmate's post from the Today feed rendered
 * "Couldn't load this week's ritual — try again shortly." and nothing else.
 *
 * These tests render the real component against a mocked API and assert on the
 * DOM the student actually gets: the post's guided answers, every reply, and a
 * composer that reaches createComment with the right arguments.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { CommunityPost, CommunityComment } from '../../../services/communityApi';

jest.mock('../../../services/communityApi', () => ({
  ...jest.requireActual('../../../services/communityApi'),
  fetchPost: jest.fn(),
  fetchComments: jest.fn(),
  createComment: jest.fn(),
  togglePostLike: jest.fn(),
  toggleCommentLike: jest.fn(),
}));

import {
  fetchPost, fetchComments, createComment, togglePostLike, toggleCommentLike,
} from '../../../services/communityApi';
import CommunityThreadPanel from '../CommunityThreadPanel';

const mFetchPost = fetchPost as jest.Mock;
const mFetchComments = fetchComments as jest.Mock;
const mCreateComment = createComment as jest.Mock;
const mTogglePostLike = togglePostLike as jest.Mock;

// React 18 requires this flag before act() drives a concurrent root; without it
// every act() call logs a warning that buries the real output.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const POST_ID = '23f34d73-75f8-46cc-96d6-31937417d0b4';

const POST: CommunityPost = {
  id: POST_ID,
  body: '🧩 Skill Drop · Week 2\n\nMy 3 skills: data quality gate, etl failed triage\n\nThe one that surprised me: the gate caught a schema drift I would have shipped.',
  media_urls: [], category: 'General', pinned: false, like_count: 4, comment_count: 1,
  viewer_has_liked: false, mentioned_member_ids: [], min_level: 1, locked: false,
  created_at: new Date(Date.now() - 3600e3).toISOString(),
  member: { id: 'm1', display_name: 'Hellen Muhonja', avatar_url: null, level: 1 },
  recent_commenters: [],
};

const COMMENT: CommunityComment = {
  id: 'c1', body: 'How long did the triage skill take to get right?',
  parent_comment_id: null, like_count: 2, viewer_has_liked: false,
  created_at: new Date(Date.now() - 1800e3).toISOString(),
  member: { id: 'm2', display_name: 'Marcus Lee', avatar_url: null, level: 2 },
  replies: [{
    id: 'c2', body: 'Three passes.', parent_comment_id: 'c1', like_count: 0,
    viewer_has_liked: false, created_at: new Date().toISOString(),
    member: { id: 'm1', display_name: 'Hellen Muhonja', avatar_url: null, level: 1 },
    replies: [],
  }],
};

let container: HTMLDivElement;
let root: Root;

async function render(props: React.ComponentProps<typeof CommunityThreadPanel>) {
  await act(async () => { root.render(<CommunityThreadPanel {...props} />); });
}
const text = () => container.textContent || '';
const byRole = (role: string) => Array.from(container.querySelectorAll(role));
const buttonNamed = (name: string) =>
  (byRole('button') as HTMLButtonElement[]).find((b) => (b.textContent || '').includes(name));

// Replies must clear the 5-word thoughtfulness bar (contributionQuality), so
// fixtures here are real sentences rather than "ok" — a two-word fixture would
// be testing the gate, not the send path.
const REAL_REPLY = 'Trying this on my pipeline tomorrow morning.';
const REAL_THREADED_REPLY = 'Same here, mine broke on the schema step.';

async function typeReply(value: string) {
  const ta = container.querySelector('.ct-ta') as HTMLTextAreaElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(ta, value);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mFetchPost.mockResolvedValue(POST);
  mFetchComments.mockResolvedValue([COMMENT]);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('showing the thread', () => {
  it('renders the post as its guided answers, with the ritual heading lifted into the eyebrow', async () => {
    await render({ postId: POST_ID });

    expect(text()).toContain('Hellen Muhonja');
    expect(text()).toContain('My 3 skills');
    expect(text()).toContain('data quality gate, etl failed triage');
    expect(text()).toContain('The one that surprised me');
    // The eyebrow carries the ritual identity once — not repeated in the body.
    expect(container.querySelector('.ct-eyebrow')?.textContent).toContain('Skill Drop');
    expect(container.querySelector('.ct-eyebrow')?.textContent).toContain('Week 2');
    expect(container.querySelector('.ct-post')?.textContent).not.toContain('Week 2');
  });

  it('shows every reply, including nested ones, without a click', async () => {
    await render({ postId: POST_ID });

    // The defect this replaces showed no thread at all; the previous design hid
    // it behind a toggle. Both replies are on screen on open.
    expect(text()).toContain('How long did the triage skill take to get right?');
    expect(text()).toContain('Three passes.');
    expect(container.querySelectorAll('.ct-cm').length).toBe(2);
    expect(container.querySelectorAll('.ct-cm.reply').length).toBe(1);
    expect(container.querySelector('.ct-threadlab')?.textContent).toBe('Discussion · 2');
  });

  it('invites the first reply when the thread is empty', async () => {
    mFetchComments.mockResolvedValue([]);
    await render({ postId: POST_ID });

    expect(text()).toContain('No replies yet');
    expect(container.querySelector('.ct-ta')).toBeTruthy();   // composer still there
  });

  it('does not repeat the ritual name when the drawer crumb already says it', async () => {
    // Live on prod the drawer read "STEAL THIS PROMPT" in the crumb and
    // "✂️ STEAL THIS PROMPT · WEEK 4" directly beneath it — the same words twice
    // within about 40px. In the drawer the panel drops its own eyebrow and folds
    // the week into the byline instead.
    await render({ postId: POST_ID, variant: 'drawer' });

    expect(container.querySelector('.ct-eyebrow')).toBeNull();
    expect(container.querySelector('.ct-sub')?.textContent).toContain('Week 2');
    expect(text()).toContain('Hellen Muhonja');
    expect(text()).toContain('My 3 skills');
  });

  it('still carries the ritual name in its eyebrow when nothing above it does', async () => {
    await render({ postId: POST_ID, variant: 'standalone' });
    expect(container.querySelector('.ct-eyebrow')?.textContent).toContain('Skill Drop');
  });

  it('falls back to the feed label for a plain post with no ritual heading', async () => {
    mFetchPost.mockResolvedValue({ ...POST, body: 'Anyone free to pair this afternoon?' });
    await render({ postId: POST_ID, fallbackLabel: 'Community Post' });

    expect(container.querySelector('.ct-eyebrow')?.textContent).toBe('Community Post');
    expect(text()).toContain('Anyone free to pair this afternoon?');
  });
});

describe('replying', () => {
  it('posts a top-level reply and shows it immediately', async () => {
    const created: CommunityComment = {
      ...COMMENT, id: 'c3', body: REAL_REPLY, replies: [], points_awarded: 2,
      member: { id: 'me', display_name: 'You', avatar_url: null, level: 1 },
    };
    mCreateComment.mockResolvedValue(created);
    await render({ postId: POST_ID });

    await typeReply(REAL_REPLY);
    await act(async () => { buttonNamed('Send')!.click(); });

    expect(mCreateComment).toHaveBeenCalledWith(POST_ID, REAL_REPLY, undefined);
    expect(text()).toContain(REAL_REPLY);
    // The composer clears, so a second send cannot repeat the first.
    expect((container.querySelector('.ct-ta') as HTMLTextAreaElement).value).toBe('');
  });

  it('threads a reply under the comment it answers', async () => {
    mCreateComment.mockResolvedValue({ ...COMMENT, id: 'c4', body: REAL_THREADED_REPLY, parent_comment_id: 'c1', replies: [] });
    await render({ postId: POST_ID });

    await act(async () => { buttonNamed('Reply')!.click(); });
    expect(text()).toContain('Replying to Marcus Lee');

    await typeReply(REAL_THREADED_REPLY);
    await act(async () => { buttonNamed('Send')!.click(); });

    expect(mCreateComment).toHaveBeenCalledWith(POST_ID, REAL_THREADED_REPLY, 'c1');
  });

  it('refuses to send an empty or whitespace-only reply', async () => {
    await render({ postId: POST_ID });
    expect((buttonNamed('Send') as HTMLButtonElement).disabled).toBe(true);

    await typeReply('   ');
    expect((buttonNamed('Send') as HTMLButtonElement).disabled).toBe(true);
    expect(mCreateComment).not.toHaveBeenCalled();
  });

  it('keeps the draft and explains itself when the send fails', async () => {
    mCreateComment.mockRejectedValue({ response: { data: { error: 'Too many comments — please slow down' } } });
    await render({ postId: POST_ID });

    await typeReply(REAL_REPLY);
    await act(async () => { buttonNamed('Send')!.click(); });

    expect(text()).toContain('Too many comments');
    // The student's words are not thrown away on a failed send.
    expect((container.querySelector('.ct-ta') as HTMLTextAreaElement).value).toBe(REAL_REPLY);
  });
});

describe('points and the thoughtfulness bar', () => {
  it('states the reward on the control that earns it', async () => {
    await render({ postId: POST_ID });
    expect((buttonNamed('Send') as HTMLButtonElement).textContent).toContain('+2');
  });

  it('blocks a one-word reply and says what is missing, without scolding', async () => {
    await render({ postId: POST_ID });
    await typeReply('nice');

    expect((buttonNamed('Send') as HTMLButtonElement).disabled).toBe(true);
    expect(text()).toContain('few more words');
    expect(text()).toContain('1/5 words');
    expect(text()).not.toMatch(/invalid|rejected|error/i);
    expect(mCreateComment).not.toHaveBeenCalled();
  });

  it('enables Send the moment the reply clears the bar', async () => {
    await render({ postId: POST_ID });
    await typeReply('one two three four');
    expect((buttonNamed('Send') as HTMLButtonElement).disabled).toBe(true);
    await typeReply('one two three four five');
    expect((buttonNamed('Send') as HTMLButtonElement).disabled).toBe(false);
  });

  it('celebrates the points the SERVER awarded, not the advertised number', async () => {
    // Past the daily community cap the award is clamped to 1. Advertising +2
    // and then celebrating +2 would be telling the student something untrue.
    mCreateComment.mockResolvedValue({ ...COMMENT, id: 'c9', body: REAL_REPLY, replies: [], points_awarded: 1 });
    await render({ postId: POST_ID });

    await typeReply(REAL_REPLY);
    await act(async () => { buttonNamed('Send')!.click(); });

    expect(text()).toContain('you earned +1 point');
    expect(text()).not.toContain('+2 points');
  });

  it('stays silent when the award was clamped to zero', async () => {
    mCreateComment.mockResolvedValue({ ...COMMENT, id: 'c10', body: REAL_REPLY, replies: [], points_awarded: 0 });
    await render({ postId: POST_ID });

    await typeReply(REAL_REPLY);
    await act(async () => { buttonNamed('Send')!.click(); });

    expect(text()).not.toMatch(/you earned/i);
    expect(text()).toContain(REAL_REPLY);   // the reply still posted
  });
});

describe('cheering and liking', () => {
  it('rolls back the optimistic cheer when the server rejects it', async () => {
    mTogglePostLike.mockRejectedValue(new Error('offline'));
    await render({ postId: POST_ID });

    await act(async () => { (container.querySelector('.ct-act') as HTMLButtonElement).click(); });

    const cheer = container.querySelector('.ct-act') as HTMLButtonElement;
    expect(cheer.textContent).toContain('4');
    expect(cheer.getAttribute('aria-pressed')).toBe('false');
  });

  it('rolls a comment like back to its own prior count, not the post’s', async () => {
    (toggleCommentLike as jest.Mock).mockRejectedValue(new Error('offline'));
    await render({ postId: POST_ID });

    const like = buttonNamed('Like · 2') as HTMLButtonElement;
    expect(like).toBeTruthy();
    await act(async () => { like.click(); });

    // Optimistic 3 → rejected → back to the comment's real 2.
    expect(buttonNamed('Like · 2')).toBeTruthy();
    expect(buttonNamed('Liked')).toBeFalsy();
  });
});

describe('failure paths', () => {
  it('offers a retry instead of a dead end when the post will not load', async () => {
    mFetchPost.mockRejectedValue({ response: { status: 500 } });
    await render({ postId: POST_ID });

    expect(text()).toContain('Couldn’t load this post.');
    expect(buttonNamed('Try again')).toBeTruthy();

    mFetchPost.mockResolvedValue(POST);
    await act(async () => { buttonNamed('Try again')!.click(); });
    expect(text()).toContain('Hellen Muhonja');
  });

  it('names a removed post rather than blaming the network', async () => {
    mFetchPost.mockRejectedValue({ response: { status: 404 } });
    await render({ postId: POST_ID });
    expect(text()).toContain('This post has been removed.');
  });

  it('still shows the post when only the replies fail', async () => {
    mFetchComments.mockRejectedValue(new Error('boom'));
    await render({ postId: POST_ID });

    expect(text()).toContain('Hellen Muhonja');
    expect(text()).toContain('data quality gate');
    expect(text()).toContain('Couldn’t load the replies.');
  });

  it('respects a level-locked post', async () => {
    mFetchPost.mockResolvedValue({ ...POST, locked: true, body: null, min_level: 3 });
    await render({ postId: POST_ID });

    expect(text()).toContain('until you reach level 3');
    expect(text()).not.toContain('data quality gate');
  });
});
