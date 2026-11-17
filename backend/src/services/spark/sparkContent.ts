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
