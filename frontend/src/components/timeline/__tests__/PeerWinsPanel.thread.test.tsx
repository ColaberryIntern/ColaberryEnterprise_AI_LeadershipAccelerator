/**
 * The weekly ritual wall could only ever applaud. Every tile on it IS a
 * community post, and the Q&A ritual's own footer said "answer in comments" —
 * with no comments anywhere in the panel. These tests pin the way through: a
 * tile opens its author's thread, and the way back is one control.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

// React 18 requires this flag before act() drives a concurrent root; without it
// every act() call logs a warning that buries the real output.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../../pages/portal/runtime/runtimeApi', () => ({
  ...jest.requireActual('../../../pages/portal/runtime/runtimeApi'),
  runtimeApi: { ritualWall: jest.fn(), postRitual: jest.fn(), cheerRitual: jest.fn() },
}));
jest.mock('../../../services/communityApi', () => ({
  ...jest.requireActual('../../../services/communityApi'),
  fetchPost: jest.fn(), fetchComments: jest.fn(), createComment: jest.fn(),
  togglePostLike: jest.fn(), toggleCommentLike: jest.fn(),
}));

import { runtimeApi } from '../../../pages/portal/runtime/runtimeApi';
import { fetchPost, fetchComments } from '../../../services/communityApi';
import PeerWinsPanel from '../PeerWinsPanel';

const mWall = runtimeApi.ritualWall as unknown as jest.Mock;
const mFetchPost = fetchPost as jest.Mock;
const mFetchComments = fetchComments as jest.Mock;

const POST_ID = 'post-1';
const CARD_ID = 'f2b1c0de-0000-4000-8000-000000000001';

const WALL = {
  card_id: CARD_ID, week: 2, title: 'Community Ritual',
  ritual: {
    key: 'skill_drop', week: 2, name: 'Skill Drop', icon: '🧩', accent: '#5BA63C',
    ask: 'Name your three skills.', lead: 'Show them off.', postCta: 'Drop my skills',
    fields: [{ key: 'skills', label: 'My 3 skills', required: true, kind: 'list' }],
    headlineField: 'skills', variant: 'chips',
    reaction: { emoji: '👏', label: 'Cheer' },
    mechanic: { icon: '📈', caption: 'skills shipped this week' }, beforeAfter: null,
  },
  wall: [{
    id: POST_ID,
    member: { id: 'm1', name: 'Hellen Muhonja', avatar_url: null, level: 1, initials: 'HM' },
    headline: 'data quality gate, etl failed triage',
    values: { skills: ['data quality gate', 'etl failed triage'] },
    link: null, like_count: 3, viewer_has_liked: false, is_mine: false,
    created_at: new Date().toISOString(),
  }],
  my_post: null, count: 1, split: null,
};

let container: HTMLDivElement;
let root: Root;
const text = () => container.textContent || '';
const buttonNamed = (name: string) =>
  (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
    .find((b) => (b.textContent || '').includes(name));

beforeEach(() => {
  jest.clearAllMocks();
  mWall.mockResolvedValue(WALL);
  mFetchPost.mockResolvedValue({
    id: POST_ID, body: '🧩 Skill Drop · Week 2\n\nMy 3 skills: data quality gate, etl failed triage',
    media_urls: [], category: 'General', pinned: false, like_count: 3, comment_count: 1,
    viewer_has_liked: false, mentioned_member_ids: [], min_level: 1, locked: false,
    created_at: new Date().toISOString(),
    member: { id: 'm1', display_name: 'Hellen Muhonja', avatar_url: null, level: 1 },
    recent_commenters: [],
  });
  mFetchComments.mockResolvedValue([{
    id: 'c1', body: 'Which one broke first?', parent_comment_id: null, like_count: 0,
    viewer_has_liked: false, created_at: new Date().toISOString(),
    member: { id: 'm2', display_name: 'Marcus Lee', avatar_url: null, level: 2 }, replies: [],
  }]);
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(cardId = CARD_ID) {
  await act(async () => { root.render(<PeerWinsPanel cardId={cardId} />); });
}

it('opens a classmate’s thread from their tile, and comes back to the wall', async () => {
  await render();
  expect(text()).toContain('data quality gate');
  expect(buttonNamed('Reply')).toBeTruthy();

  await act(async () => { buttonNamed('Reply')!.click(); });

  // The thread — the post AND its replies AND a composer, none of it here before.
  expect(mFetchPost).toHaveBeenCalledWith(POST_ID);
  expect(text()).toContain('Which one broke first?');
  expect(container.querySelector('.ct-ta')).toBeTruthy();

  await act(async () => { buttonNamed('Back to the wall')!.click(); });
  expect(text()).toContain('Skill Drop');
  expect(container.querySelector('.ct-ta')).toBeFalsy();
});

it('refuses a Today-feed community ref instead of 500ing on it', async () => {
  // The exact id prod sent: GET /runtime/cards/community:<uuid>/peer-wins → 500.
  await render('community:23f34d73-75f8-46cc-96d6-31937417d0b4');

  expect(mWall).not.toHaveBeenCalled();
  expect(text()).toContain('community post, not a weekly ritual card');
  expect(buttonNamed('Try again')).toBeTruthy();
});

it('offers a retry rather than a dead end when the wall fails to load', async () => {
  mWall.mockRejectedValue(new Error('500'));
  await render();

  expect(text()).toContain('Couldn’t load this week’s ritual');
  expect(buttonNamed('Try again')).toBeTruthy();

  mWall.mockResolvedValue(WALL);
  await act(async () => { buttonNamed('Try again')!.click(); });
  expect(text()).toContain('data quality gate');
});
