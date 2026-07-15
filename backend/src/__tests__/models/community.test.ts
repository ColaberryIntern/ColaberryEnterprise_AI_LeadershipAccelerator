/**
 * Community + Gamification model tests (Epic 4, BC #10036783688 / todo 9985689666).
 *
 * Mirrors the associations.test.ts pattern: a mocked (never-connected) postgres
 * Sequelize instance so association wiring can be inspected without a real DB.
 * Also exercises Sequelize's synchronous .validate() path (no I/O) to cover
 * failure/boundary cases for the constraints that matter most: required
 * fields, enum membership, and the like/leaderboard idempotency keys.
 */

jest.mock('../../config/database', () => {
  const { Sequelize } = require('sequelize');
  const sequelize = new Sequelize('postgres://mock:mock@localhost:5432/mock', {
    dialect: 'postgres',
    logging: false,
  });
  return { sequelize, connectDatabase: jest.fn() };
});

jest.mock('../../config/env', () => ({
  env: {
    databaseUrl: 'postgres://mock:mock@localhost:5432/mock',
    nodeEnv: 'test',
    jwtSecret: 'test-secret',
    port: 3000,
  },
}));

import * as Models from '../../models';

function hasAssociation(model: any, alias: string): boolean {
  return model.associations && alias in model.associations;
}

describe('Community models are exported and registered', () => {
  const expectedModels = [
    'CommunityMember',
    'CommunityPost',
    'CommunityComment',
    'CommunityLike',
    'CommunityLeaderboardEntry',
    'CommunityEvent',
  ];

  test.each(expectedModels)('should export %s', (modelName) => {
    expect((Models as any)[modelName]).toBeDefined();
  });
});

describe('Community associations', () => {
  test('Enrollment has communityMember (1:1)', () => {
    expect(hasAssociation(Models.Enrollment, 'communityMember')).toBe(true);
  });

  test('CommunityMember belongs to enrollment', () => {
    expect(hasAssociation(Models.CommunityMember, 'enrollment')).toBe(true);
  });

  test('Cohort has communityPosts', () => {
    expect(hasAssociation(Models.Cohort, 'communityPosts')).toBe(true);
  });

  test('CommunityPost belongs to cohort and member', () => {
    expect(hasAssociation(Models.CommunityPost, 'cohort')).toBe(true);
    expect(hasAssociation(Models.CommunityPost, 'member')).toBe(true);
  });

  test('CommunityPost has comments', () => {
    expect(hasAssociation(Models.CommunityPost, 'comments')).toBe(true);
  });

  test('CommunityComment has nested replies and belongs to a parent', () => {
    expect(hasAssociation(Models.CommunityComment, 'replies')).toBe(true);
    expect(hasAssociation(Models.CommunityComment, 'parentComment')).toBe(true);
  });

  test('CommunityMember has likes and leaderboardEntries', () => {
    expect(hasAssociation(Models.CommunityMember, 'likes')).toBe(true);
    expect(hasAssociation(Models.CommunityMember, 'leaderboardEntries')).toBe(true);
  });

  test('Cohort has communityEvents', () => {
    expect(hasAssociation(Models.Cohort, 'communityEvents')).toBe(true);
  });
});

describe('CommunityMember validation', () => {
  it('happy path: builds with required fields', async () => {
    const member = Models.CommunityMember.build({
      enrollment_id: '11111111-1111-1111-1111-111111111111',
      display_name: 'Ada Lovelace',
    } as any);
    await expect(member.validate()).resolves.toBeDefined();
    expect(member.level).toBe(1);
    expect(member.points).toBe(0);
    expect(member.presence_status).toBe('offline');
  });

  it('failure path: "invisible" is not an allowed presence_status (enforced by the DB ENUM/CHECK, not the JS layer)', () => {
    const allowed = (Models.CommunityMember as any).rawAttributes.presence_status.values;
    expect(allowed).toEqual(['online', 'away', 'offline']);
    expect(allowed).not.toContain('invisible');
  });

  it('boundary path: rejects a missing display_name', async () => {
    const member = Models.CommunityMember.build({
      enrollment_id: '11111111-1111-1111-1111-111111111111',
    } as any);
    await expect(member.validate()).rejects.toThrow();
  });
});

describe('CommunityPost validation', () => {
  const memberId = '22222222-2222-2222-2222-222222222222';
  const cohortId = '33333333-3333-3333-3333-333333333333';

  it('happy path: builds with required fields and default counters', async () => {
    const post = Models.CommunityPost.build({
      member_id: memberId,
      cohort_id: cohortId,
      body: 'Shipped my first requirement today!',
    } as any);
    await expect(post.validate()).resolves.toBeDefined();
    expect(post.pinned).toBe(false);
    expect(post.like_count).toBe(0);
    expect(post.comment_count).toBe(0);
    expect(post.media_urls).toEqual([]);
  });

  it('boundary path: rejects an empty body', async () => {
    const post = Models.CommunityPost.build({
      member_id: memberId,
      cohort_id: cohortId,
      body: '',
    } as any);
    await expect(post.validate()).rejects.toThrow();
  });
});

describe('CommunityLike validation', () => {
  it('failure path: "reaction" is not an allowed likeable_type (enforced by the DB ENUM/CHECK, not the JS layer)', () => {
    const allowed = (Models.CommunityLike as any).rawAttributes.likeable_type.values;
    expect(allowed).toEqual(['post', 'comment']);
    expect(allowed).not.toContain('reaction');
  });

  it('happy path: builds a valid post like', async () => {
    const like = Models.CommunityLike.build({
      member_id: '44444444-4444-4444-4444-444444444444',
      likeable_type: 'post',
      likeable_id: '55555555-5555-5555-5555-555555555555',
    } as any);
    await expect(like.validate()).resolves.toBeDefined();
  });

  it('idempotency contract: the member+likeable unique index is registered', () => {
    const indexes = (Models.CommunityLike as any).options.indexes;
    const dedupIndex = indexes.find((idx: any) => idx.name === 'uq_community_likes_member_target');
    expect(dedupIndex).toBeDefined();
    expect(dedupIndex.unique).toBe(true);
    expect(dedupIndex.fields).toEqual(['member_id', 'likeable_type', 'likeable_id']);
  });
});

describe('CommunityLeaderboardEntry validation', () => {
  it('failure path: "quarterly" is not an allowed period (enforced by the DB ENUM/CHECK, not the JS layer)', () => {
    const allowed = (Models.CommunityLeaderboardEntry as any).rawAttributes.period.values;
    expect(allowed).toEqual(['7d', '30d', 'all_time']);
    expect(allowed).not.toContain('quarterly');
  });

  it('idempotency contract: the member+period unique index is registered', () => {
    const indexes = (Models.CommunityLeaderboardEntry as any).options.indexes;
    const dedupIndex = indexes.find(
      (idx: any) => idx.name === 'uq_community_leaderboard_member_period'
    );
    expect(dedupIndex).toBeDefined();
    expect(dedupIndex.unique).toBe(true);
    expect(dedupIndex.fields).toEqual(['member_id', 'period']);
  });
});

describe('CommunityEvent validation', () => {
  it('boundary path: rejects a missing starts_at', async () => {
    const event = Models.CommunityEvent.build({
      cohort_id: '77777777-7777-7777-7777-777777777777',
      title: 'Mon session',
    } as any);
    await expect(event.validate()).rejects.toThrow();
  });

  it('failure path: "party" is not an allowed event_type (enforced by the DB ENUM/CHECK, not the JS layer)', () => {
    const allowed = (Models.CommunityEvent as any).rawAttributes.event_type.values;
    expect(allowed).toEqual(['session', 'open_house', 'office_hours', 'other']);
    expect(allowed).not.toContain('party');
  });
});

// Regression guard for a real bug found via live browser verification of the
// Community tab: these 4 models declare snake_case created_at/updated_at in
// their TS class, but Sequelize's auto-timestamp JS attribute names default
// to createdAt/updatedAt even with underscored:true (that option only renames
// the DB column). Without an explicit createdAt/updatedAt override in .init(),
// every service function reading `.created_at` silently gets undefined — it
// gets dropped by JSON.stringify, so the API response is missing the field
// entirely rather than throwing, which is how this slipped through 3 merged
// PRs' worth of mocked-instance tests. Checked via rawAttributes so no DB I/O.
describe('Community models: created_at/updated_at attribute naming', () => {
  const modelsWithTimestamps = [
    Models.CommunityMember,
    Models.CommunityPost,
    Models.CommunityComment,
    Models.CommunityEvent,
  ];

  test.each(modelsWithTimestamps.map((m) => [m.name, m]))(
    '%s exposes created_at/updated_at as real attributes, not createdAt/updatedAt',
    (_name, model: any) => {
      const attrs = model.rawAttributes;
      expect(attrs.created_at).toBeDefined();
      expect(attrs.updated_at).toBeDefined();
      expect(attrs.createdAt).toBeUndefined();
      expect(attrs.updatedAt).toBeUndefined();
    }
  );
});
