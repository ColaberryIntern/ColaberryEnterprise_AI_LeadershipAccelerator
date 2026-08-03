/**
 * peerWinsService — the Community Rituals engine behind the `community_discussion`
 * curriculum type (render_band 'peer_wins'). After a student finishes a section,
 * this card runs THAT WEEK'S ritual (see communityRituals.ts): Roll Call, Skill
 * Drop, Cohort Wins, Unblock Me, Hot Take, Architect Manifesto, and so on. The
 * ritual is resolved from the card's `week`; the composer + wall render from its
 * config, so one panel serves all twelve.
 *
 * A ritual post IS a community_posts row (category per ritual) tethered to
 * (source_card_id, program_id, week) and carrying ritual_meta = { ritual, values }.
 * We REUSE communityService.createPost so it earns the same points + notifications
 * as any post. Kudos reuse the community like toggle — no parallel reactions.
 *
 * Idempotency: one visible post per (member, source_card_id). Re-submitting UPDATES
 * the student's own post in place. Reads are cohort-scoped.
 */
import CommunityPost from '../../models/CommunityPost';
import CommunityLike from '../../models/CommunityLike';
import CommunityMember from '../../models/CommunityMember';
import TimelineCard from '../../models/TimelineCard';
import { getOrCreateMember, resolveCohortId, createPost } from '../communityService';
import {
  ritualForWeek, publicRitual, PublicRitual, RitualConfig, RitualValues,
  normalizeValues, composeBody, headlineOf, linkField, isHttp,
} from './communityRituals';

export interface RitualTileMember { id: string; name: string; avatar_url: string | null; level: number; initials: string }

export interface RitualTile {
  id: string;
  member: RitualTileMember;
  headline: string;                                   // the ritual's headline field
  values: Record<string, string | string[]>;          // all guided field values
  link: string | null;                                // first link-kind field, if any
  like_count: number;                                 // the ritual's reaction count
  viewer_has_liked: boolean;
  is_mine: boolean;
  created_at: Date;
}

export interface RitualWall {
  card_id: string;
  week: number | null;
  title: string | null;
  ritual: PublicRitual;
  wall: RitualTile[];
  my_post: RitualTile | null;
  count: number;
  /** debate variant only — the live agree / push-back split across the wall. */
  split: { choices: string[]; counts: number[] } | null;
}

function notFound(msg: string): Error { return Object.assign(new Error(msg), { status: 404 }); }

function initialsFor(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || '?';
}

function toTile(
  post: { id: string; ritual_meta: any; media_urls: string[]; like_count: number; created_at: Date; member_id?: string },
  ritual: RitualConfig,
  member: RitualTileMember,
  viewerHasLiked: boolean,
  isMine: boolean,
): RitualTile {
  const meta = post.ritual_meta && typeof post.ritual_meta === 'object' ? post.ritual_meta : {};
  const values: RitualValues = meta.values && typeof meta.values === 'object' ? meta.values : {};
  const lf = linkField(ritual);
  const link = (lf && typeof values[lf.key] === 'string' ? (values[lf.key] as string) : null)
    || (Array.isArray(post.media_urls) ? post.media_urls[0] ?? null : null);
  return {
    id: post.id, member, headline: headlineOf(ritual, values), values, link,
    like_count: post.like_count ?? 0, viewer_has_liked: viewerHasLiked, is_mine: isMine,
    created_at: post.created_at,
  };
}

async function loadCard(cardId: string): Promise<{ id: string; program_id: string | null; week: number | null; title: string | null }> {
  const card = await TimelineCard.findByPk(cardId, { attributes: ['id', 'program_id', 'week', 'title'] });
  if (!card) throw notFound('Card not found');
  return { id: card.id, program_id: (card as any).program_id ?? null, week: card.week ?? null, title: card.title ?? null };
}

/** The cohort's ritual wall for this card + the viewer's own post + the ritual config. */
export async function getRitualWall(enrollmentId: string, cardId: string): Promise<RitualWall> {
  const card = await loadCard(cardId);
  const ritual = ritualForWeek(card.week);
  const [member, cohortId] = await Promise.all([getOrCreateMember(enrollmentId), resolveCohortId(enrollmentId)]);

  const rows = await CommunityPost.findAll({
    where: { cohort_id: cohortId, source_card_id: cardId, status: 'visible' },
    include: [{ model: CommunityMember, as: 'member', attributes: ['id', 'display_name', 'avatar_url', 'level'] }],
    order: [['like_count', 'DESC'], ['created_at', 'DESC']],
  });

  const ids = rows.map((r: any) => r.id);
  const likedIds = new Set<string>();
  if (ids.length) {
    const likes = await CommunityLike.findAll({
      where: { likeable_type: 'post', likeable_id: ids, member_id: member.id }, attributes: ['likeable_id'],
    });
    for (const l of likes as any[]) likedIds.add(l.likeable_id);
  }

  const wall: RitualTile[] = rows.map((r: any) => {
    const m = r.member;
    const tileMember: RitualTileMember = {
      id: m?.id ?? r.member_id, name: m?.display_name ?? 'A classmate', avatar_url: m?.avatar_url ?? null,
      level: m?.level ?? 1, initials: initialsFor(m?.display_name ?? 'A classmate'),
    };
    return toTile(r, ritual, tileMember, likedIds.has(r.id), r.member_id === member.id);
  });

  // Debate ritual: tally the chosen side across the wall for the live split bar.
  let split: RitualWall['split'] = null;
  if (ritual.variant === 'debate') {
    const choiceField = ritual.fields.find((f) => f.kind === 'choice');
    if (choiceField?.choices) {
      const counts = choiceField.choices.map((c) => rows.filter((r: any) => (r.ritual_meta?.values?.[choiceField.key]) === c).length);
      split = { choices: choiceField.choices, counts };
    }
  }

  return {
    card_id: cardId, week: card.week, title: card.title,
    ritual: publicRitual(ritual), wall,
    my_post: wall.find((w) => w.is_mine) ?? null, count: wall.length, split,
  };
}

/** Create OR update this student's ritual post for the card. Idempotent: one visible
 *  post per (member, card). First post awards points (via createPost); an edit does not. */
export async function submitRitualPost(
  enrollmentId: string, cardId: string, rawValues: RitualValues,
): Promise<{ post: RitualTile; created: boolean }> {
  const card = await loadCard(cardId);
  const ritual = ritualForWeek(card.week);
  const values = normalizeValues(ritual, rawValues);
  const member = await getOrCreateMember(enrollmentId);

  const body = composeBody(ritual, values);
  const lf = linkField(ritual);
  const link = lf && typeof values[lf.key] === 'string' ? (values[lf.key] as string) : null;
  const media_urls = link && isHttp(link) ? [link] : [];
  const ritual_meta = { ritual: ritual.key, values };

  const existing = await CommunityPost.findOne({
    where: { member_id: member.id, source_card_id: cardId, status: 'visible' },
  });

  if (existing) {
    await existing.update({ body, media_urls, ritual_meta, category: ritual.category });
    const liked = await CommunityLike.findAll({
      where: { likeable_type: 'post', likeable_id: existing.id, member_id: member.id }, attributes: ['likeable_id'],
    });
    const tileMember: RitualTileMember = {
      id: member.id, name: member.display_name, avatar_url: member.avatar_url, level: member.level, initials: initialsFor(member.display_name),
    };
    return { post: toTile(existing as any, ritual, tileMember, liked.length > 0, true), created: false };
  }

  const item = await createPost(enrollmentId, {
    body, category: ritual.category, media_urls,
    program_id: card.program_id ?? undefined, week: card.week ?? undefined,
    source_card_id: cardId, ritual_meta,
  } as any);

  const tileMember: RitualTileMember = {
    id: item.member.id, name: item.member.display_name, avatar_url: item.member.avatar_url, level: item.member.level, initials: initialsFor(item.member.display_name),
  };
  return {
    post: toTile(
      { id: item.id, ritual_meta, media_urls: item.media_urls, like_count: item.like_count, created_at: item.created_at, member_id: item.member.id },
      ritual, tileMember, false, true,
    ),
    created: true,
  };
}
