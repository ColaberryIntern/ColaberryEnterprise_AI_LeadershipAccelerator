import { RITUALS, parseRitualHeading } from '../runtime/communityRituals';

/**
 * Which weekly ritual a community post answered (Campus v14 B1, Basecamp C65). The ritual already lives on the post
 * (`community_posts.ritual_meta.ritual`, written by the ritual composer) but was never sent to the client, so every surface guessed
 * from the body text. Posts written before ritual_meta existed are read from the composed heading ("<icon> <Name> - Week <n>") at read
 * time, never in a migration, through the same parser communityRituals owns (parseRitualHeading). A body that only MENTIONS a ritual
 * name mid-sentence has no heading and reads as no ritual.
 */
export interface PostRitual { key: string; name: string; icon: string; week: number }

const BY_KEY = new Map(Object.values(RITUALS).map((r) => [r.key, r]));
const BY_NAME = new Map(Object.values(RITUALS).map((r) => [r.name.toLowerCase(), r]));

export function ritualFromBody(body: string | null | undefined): PostRitual | null {
  const h = parseRitualHeading(body);
  if (!h) return null;
  const r = BY_NAME.get(h.name.trim().toLowerCase());
  return r ? { key: r.key, name: r.name, icon: r.icon, week: h.week } : null;
}

/** From the stored ritual key when there is one (the week the post was made, else the ritual's own week), else from the body. */
export function ritualOf(meta: { ritual?: string | null } | null | undefined, body: string | null | undefined, week?: number | null): PostRitual | null {
  const r = meta?.ritual ? BY_KEY.get(meta.ritual) : undefined;
  if (r) return { key: r.key, name: r.name, icon: r.icon, week: week ?? r.week };
  return ritualFromBody(body);
}
