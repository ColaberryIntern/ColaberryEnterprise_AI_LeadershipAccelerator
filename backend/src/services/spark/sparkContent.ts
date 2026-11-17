/**
 * Spark Hour - the questions. The 20-question "get to know you" survey is answered once (in pieces,
 * carried day to day until finished); after that, 3 daily questions rotate from the bank below.
 * Each person answers alone and never sees the other's answers. Spark reads both to decide.
 */

export type QType = 'choice' | 'this' | 'rank' | 'scale' | 'open';
export interface Question { id: string; type: QType; text: string; options?: string[] }

export const SURVEY: Question[] = [
  { id: 's01', type: 'choice', text: 'Your perfect open hour in the middle of a workday?', options: ['Cooking something new together', 'A walk somewhere pretty', 'A nap together, no phones', 'Trying a place we have never been'] },
  { id: 's02', type: 'open', text: 'Describe a date from our past you would replay exactly as it was.' },
  { id: 's03', type: 'rank', text: 'Rank these vibes, favorite first.', options: ['Playful', 'Romantic', 'Adventurous', 'Cozy'] },
  { id: 's04', type: 'this', text: 'Sunrise or sunset?', options: ['Sunrise', 'Sunset'] },
  { id: 's05', type: 'this', text: 'Live music or a comedy show?', options: ['Live music', 'Comedy show'] },
  { id: 's06', type: 'choice', text: 'What food mood are you in most weeks?', options: ['Comfort food', 'Spicy', 'Fancy', 'Street food'] },
  { id: 's07', type: 'open', text: 'Something you have always wanted to learn together.' },
  { id: 's08', type: 'scale', text: 'How do you feel about surprises?', options: ['1 · Tell me everything', '2', '3 · A little mystery', '4', '5 · Blindfold me'] },
  { id: 's09', type: 'choice', text: 'Outdoors pick?', options: ['Lake', 'Trail', 'Garden', 'Rooftop'] },
  { id: 's10', type: 'open', text: 'A small thing I do that makes your whole day.' },
  { id: 's11', type: 'choice', text: 'Game night pick?', options: ['Cards', 'Video games', 'A puzzle', 'A cook-off'] },
  { id: 's12', type: 'open', text: 'What does a "too busy" week look like for you, and what helps?' },
  { id: 's13', type: 'choice', text: 'How much is a good date worth?', options: ['Up to $25', 'Up to $75', 'Up to $150', 'Special occasion, no limit'] },
  { id: 's14', type: 'open', text: 'Name the song that is "us."' },
  { id: 's15', type: 'rank', text: 'Which feels most like love? Rank them, most first.', options: ['Words', 'Touch', 'Time together', 'Help with things', 'Gifts'] },
  { id: 's16', type: 'choice', text: 'Should Creed join a Spark sometimes?', options: ['Never, Sparks are just us', 'Weekends only', 'About once a month'] },
  { id: 's17', type: 'choice', text: 'Dare level to start?', options: ['Sweet', 'Cheeky', 'Spicy'] },
  { id: 's18', type: 'open', text: 'One place within 1.5 hours you have never been but want to go.' },
  { id: 's19', type: 'open', text: 'Things that kill the mood for you on a date.' },
  { id: 's20', type: 'open', text: 'Finish it: "I feel closest to you when…"' },
];

/** Daily questions: 3 a weekday, rotating. Playful first, then deeper as the weeks go on. */
export const DAILY: Question[] = [
  { id: 'd001', type: 'this', text: 'Breakfast in bed, or breakfast out?', options: ['In bed', 'Out'] },
  { id: 'd002', type: 'choice', text: 'How bold should this week\'s dares be?', options: ['Sweet', 'Cheeky', 'Spicy'] },
  { id: 'd003', type: 'open', text: 'Finish it: "The last time I really laughed with you was…"' },
  { id: 'd004', type: 'this', text: 'Dance class or cooking class?', options: ['Dance class', 'Cooking class'] },
  { id: 'd005', type: 'scale', text: 'Energy level this week?', options: ['1 · Running on fumes', '2', '3 · Normal', '4', '5 · Ready for anything'] },
  { id: 'd006', type: 'open', text: 'A dish you grew up with that you want us to learn.' },
  { id: 'd007', type: 'this', text: 'Picnic or patio restaurant?', options: ['Picnic', 'Patio'] },
  { id: 'd008', type: 'choice', text: 'Best way to spend 15 minutes with me?', options: ['Talking, no phones', 'A walk around the block', 'Music in the kitchen', 'Just sitting close'] },
  { id: 'd009', type: 'open', text: 'What is something new you noticed about me lately?' },
  { id: 'd010', type: 'this', text: 'Museum or market?', options: ['Museum', 'Market'] },
  { id: 'd011', type: 'choice', text: 'Which would make a midday hour feel special?', options: ['A surprise', 'Good food', 'Being outside', 'Laughing a lot'] },
  { id: 'd012', type: 'open', text: 'A trip we took that you still think about. What made it good?' },
  { id: 'd013', type: 'this', text: 'Board game or card game?', options: ['Board game', 'Card game'] },
  { id: 'd014', type: 'scale', text: 'How adventurous do you feel for the weekend date?', options: ['1 · Keep it cozy', '2', '3', '4', '5 · Something we have never done'] },
  { id: 'd015', type: 'open', text: 'Something you want more of from me this month.' },
  { id: 'd016', type: 'this', text: 'Coffee shop or tea house?', options: ['Coffee', 'Tea'] },
  { id: 'd017', type: 'choice', text: 'Pick a theme for a Spark at home.', options: ['Around the world food night', '90s throwback', 'Spa hour', 'Backyard camping'] },
  { id: 'd018', type: 'open', text: 'Describe your perfect lazy Sunday morning with me.' },
  { id: 'd019', type: 'this', text: 'Thrift store hunt or bookstore browse?', options: ['Thrift store', 'Bookstore'] },
  { id: 'd020', type: 'choice', text: 'If we had an open afternoon with no kids, first thing we do?', options: ['Nap', 'Go out to eat', 'Something active', 'Stay in, just us'] },
  { id: 'd021', type: 'open', text: 'A compliment you have never said out loud to me.' },
  { id: 'd022', type: 'this', text: 'Karaoke or bowling?', options: ['Karaoke', 'Bowling'] },
  { id: 'd023', type: 'scale', text: 'How much did this week\'s Sparks feel like "us"?', options: ['1 · Not really', '2', '3', '4', '5 · Exactly us'] },
  { id: 'd024', type: 'open', text: 'A dream we have talked about that we should take one small step on.' },
  { id: 'd025', type: 'this', text: 'Stargazing or sunrise watch?', options: ['Stargazing', 'Sunrise'] },
  { id: 'd026', type: 'choice', text: 'Favorite kind of surprise from me?', options: ['A note', 'A treat', 'A plan already made', 'A song'] },
  { id: 'd027', type: 'open', text: 'When do you feel most supported by me?' },
  { id: 'd028', type: 'this', text: 'Paint night or pottery?', options: ['Painting', 'Pottery'] },
  { id: 'd029', type: 'choice', text: 'Our best date season?', options: ['Fall', 'Winter', 'Spring', 'Summer'] },
  { id: 'd030', type: 'open', text: 'What is one thing we did this year that you are proud of us for?' },
  { id: 'd031', type: 'this', text: 'Food truck crawl or fancy dessert?', options: ['Food trucks', 'Fancy dessert'] },
  { id: 'd032', type: 'scale', text: 'How connected do you feel to me this week?', options: ['1 · Far apart', '2', '3', '4', '5 · Very close'] },
  { id: 'd033', type: 'open', text: 'A memory with me that still makes you smile.' },
  { id: 'd034', type: 'this', text: 'Hike or bike?', options: ['Hike', 'Bike'] },
  { id: 'd035', type: 'choice', text: 'What would you love to learn in one hour?', options: ['A new dance', 'A new recipe', 'A card trick', 'A few words of a new language'] },
  { id: 'd036', type: 'open', text: 'What is something about our early days you miss?' },
  { id: 'd037', type: 'this', text: 'Rooftop drinks or lakeside walk?', options: ['Rooftop', 'Lakeside'] },
  { id: 'd038', type: 'choice', text: 'Pick a weekend date vibe.', options: ['Dressed up', 'Comfy and casual', 'Active', 'Artsy'] },
  { id: 'd039', type: 'open', text: 'What is a way I could make a hard day easier for you?' },
  { id: 'd040', type: 'this', text: 'Old favorite place or brand new spot?', options: ['Old favorite', 'Brand new'] },
  { id: 'd041', type: 'scale', text: 'How much fun was our last Spark?', options: ['1 · Meh', '2', '3', '4', '5 · Best one yet'] },
  { id: 'd042', type: 'open', text: 'Plan our perfect anniversary in one sentence.' },
  { id: 'd043', type: 'this', text: 'Slow dance or fast dance?', options: ['Slow', 'Fast'] },
  { id: 'd044', type: 'choice', text: 'What should Spark do more of?', options: ['Outings', 'At-home fun', 'Food', 'Deep talks'] },
  { id: 'd045', type: 'open', text: 'Finish it: "Next year, I want us to…"' },
];

export function dailyFor(index: number): Question[] {
  const start = (index * 3) % DAILY.length;
  return [0, 1, 2].map((i) => DAILY[(start + i) % DAILY.length]);
}

/** Readable "question: answer" lines for the planner. Rank answers are arrays in order. */
export function answerLines(qs: Question[], answers: Record<string, unknown>): string[] {
  return qs.filter((q) => answers[q.id] !== undefined && answers[q.id] !== '').map((q) => {
    const a = answers[q.id];
    return `${q.text} → ${Array.isArray(a) ? a.join(' > ') : String(a).slice(0, 400)}`;
  });
}

export const ALL_QUESTIONS: Question[] = [...SURVEY, ...DAILY];

/**
 * Game of the Day (Ali, 2026-11-16): one throwback-style arcade game per weekday, 3 tries, best score
 * wins. These are our own games in classic arcade styles (not copies of any trademarked game). Only
 * games marked `ready` are played; the rest are added in later batches and join the rotation then.
 * `maxScore` is a sanity cap on what a browser may report.
 */
export interface Game { id: string; name: string; emoji: string; how: string; ready: boolean; maxScore: number }
export const GAMES: Game[] = [
  { id: 'blockdrop', name: 'Block Drop', emoji: '🧱', how: 'Fit the falling blocks into full rows. Use the arrow buttons, ⟳ to turn, ▼ to drop.', ready: true, maxScore: 100000 },
  { id: 'bullseye', name: 'Bullseye Stop', emoji: '🎯', how: 'Stop the light in the gold stripe. 5 rounds, each one faster.', ready: true, maxScore: 500 },
  { id: 'snake', name: 'Snake Trail', emoji: '🐍', how: 'Eat the dots and grow. Do not hit the wall or yourself. Swipe or use the arrows.', ready: true, maxScore: 5000 },
  { id: 'bricks', name: 'Brick Breaker', emoji: '🏓', how: 'Slide the paddle to keep the ball up and break every brick.', ready: true, maxScore: 5000 },
  { id: 'memory', name: 'Memory Match', emoji: '🃏', how: 'Flip two cards at a time and find all 8 pairs. Fast and few misses scores higher.', ready: true, maxScore: 1000 },
  { id: 'whack', name: 'Pop-Up Whack', emoji: '🔨', how: 'Tap the hearts as they pop up. Skip the 💣. 30 seconds.', ready: true, maxScore: 5000 },
  { id: 'maze', name: 'Maze Chase', emoji: '👻', how: 'Eat every dot in the maze and dodge the ghosts.', ready: false, maxScore: 10000 },
  { id: 'swarm', name: 'Space Swarm', emoji: '🚀', how: 'Slide and shoot the swarm before it lands.', ready: false, maxScore: 10000 },
  { id: 'hopper', name: 'Road Hopper', emoji: '🐸', how: 'Hop across the lanes without getting hit.', ready: false, maxScore: 10000 },
  { id: 'rocks', name: 'Rock Blaster', emoji: '☄️', how: 'Turn, thrust and blast the rocks into pieces.', ready: false, maxScore: 10000 },
  { id: 'paddle', name: 'Paddle Duel', emoji: '🏓', how: 'Beat the computer to 7 points.', ready: false, maxScore: 1000 },
  { id: 'merge', name: 'Number Merge', emoji: '🔢', how: 'Slide tiles so matching numbers merge.', ready: false, maxScore: 100000 },
  { id: 'mines', name: 'Mine Field', emoji: '💣', how: 'Clear the field without hitting a mine.', ready: false, maxScore: 1000 },
  { id: 'echo', name: 'Color Echo', emoji: '🎵', how: 'Repeat the color pattern as it grows.', ready: false, maxScore: 1000 },
  { id: 'stack', name: 'Stack Tower', emoji: '🏗️', how: 'Drop each layer right on top of the last one.', ready: false, maxScore: 1000 },
  { id: 'shield', name: 'City Shield', emoji: '🛡️', how: 'Tap to stop the falling rockets before they hit the city.', ready: false, maxScore: 10000 },
  { id: 'landing', name: 'Soft Landing', emoji: '🌙', how: 'Land the craft gently on the pad.', ready: false, maxScore: 1000 },
  { id: 'bubbles', name: 'Bubble Pop', emoji: '🫧', how: 'Aim and match 3 bubbles of a color.', ready: false, maxScore: 10000 },
  { id: 'dash', name: 'Desert Dash', emoji: '🏜️', how: 'Tap to jump the cactus and keep running.', ready: false, maxScore: 10000 },
  { id: 'words', name: 'Word Rush', emoji: '⌨️', how: 'Type the falling words before they land.', ready: false, maxScore: 10000 },
];
export const gameForDay = (index: number): Game => { const r = GAMES.filter((g) => g.ready); return r[index % r.length]; };

/** Wager prizes: each about 15 minutes of effort. The winner gets their top pick from their top group. */
export const WAGER: Record<string, string[]> = {
  'Sweet 💗': ['15-minute foot rub', 'Coffee or tea made exactly my way, served to me', '15 minutes, no phones, all mine'],
  'Sexy 🔥': ['15-minute massage, your choice of oil', 'Slow dance in the kitchen to my song', 'You pick my outfit for the weekend date'],
  'Funny 😂': ['Loser narrates dinner like a nature show', 'Loser wears my pick of silly hat all evening', 'Loser does one chore in a dramatic voice'],
  'Crafty ✂️': ['A 10-minute portrait of me (any skill level)', 'A playlist made just for me', 'A handwritten love note, hidden somewhere'],
  'Errand 🛒': ['A store run for my favorite snack', 'Order my favorite dinner tonight', 'You handle one thing on my to-do list'],
};
