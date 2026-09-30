import CommunityRoom, { RoomCategory } from '../models/CommunityRoom';

// Ten always-open, fruit-themed public video rooms so the Rooms area is never
// empty and there's always somewhere to jump in. Idempotent (findOrCreate by
// slug). The Google Meet link is minted lazily on first join (roomService.joinVideoRoom).

interface DefaultRoom {
  slug: string;
  name: string;
  category: RoomCategory;
  emoji: string;
  tagline: string;
}

const DEFAULT_ROOMS: DefaultRoom[] = [
  { slug: 'room-mango-lounge',        name: 'Mango Lounge',        category: 'social',         emoji: '🥭', tagline: 'Kick back and hang with the cohort.' },
  { slug: 'room-kiwi-kitchen',        name: 'Kiwi Kitchen',        category: 'build_together', emoji: '🥝', tagline: 'Cook up a build together.' },
  { slug: 'room-pineapple-pavilion',  name: 'Pineapple Pavilion',  category: 'demos_events',   emoji: '🍍', tagline: 'Show your work — demos & show-and-tell.' },
  { slug: 'room-peach-porch',         name: 'Peach Porch',         category: 'social',         emoji: '🍑', tagline: 'Chill, chat, good vibes.' },
  { slug: 'room-cherry-chamber',      name: 'Cherry Chamber',      category: 'career_cert',    emoji: '🍒', tagline: 'Portfolio reviews & interview practice.' },
  { slug: 'room-strawberry-studio',   name: 'Strawberry Studio',   category: 'build_together', emoji: '🍓', tagline: 'Claude Code · MCP · agents.' },
  { slug: 'room-watermelon-workshop', name: 'Watermelon Workshop', category: 'build_together', emoji: '🍉', tagline: 'Heads-down co-working.' },
  { slug: 'room-blueberry-bunker',    name: 'Blueberry Bunker',    category: 'start_here',     emoji: '🫐', tagline: 'New here? Come say hi.' },
  { slug: 'room-coconut-club',        name: 'Coconut Club',        category: 'social',         emoji: '🥥', tagline: 'Late-night hangout.' },
  { slug: 'room-grape-gallery',       name: 'Grape Gallery',       category: 'demos_events',   emoji: '🍇', tagline: 'Architecture reviews & walkthroughs.' },
];

export async function seedDefaultCommunityRooms(): Promise<{ created: number; existing: number }> {
  let created = 0;
  let existing = 0;
  for (const r of DEFAULT_ROOMS) {
    const [, wasCreated] = await CommunityRoom.findOrCreate({
      where: { slug: r.slug },
      defaults: {
        slug: r.slug,
        name: r.name,
        category: r.category,
        room_type: 'persistent',
        privacy: 'public',
        status: 'active',
        topic: r.tagline,
        is_video: true,
        always_open: true,
        is_system: true,
        created_by: 'system',
        metadata: { emoji: r.emoji, tagline: r.tagline, default_room: true },
      },
    });
    if (wasCreated) created += 1;
    else existing += 1;
  }
  return { created, existing };
}
