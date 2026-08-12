/**
 * ai_quote_of_the_day — CURATED intel source: one substantive quote per run about
 * AI, software architecture, and engineering leadership.
 *
 * collect() returns a static, authored set of well-attributed quotes as seed items.
 * It does NOT fetch and NEVER throws. guid is `quote:<shortHash(text)>` so it is
 * stable per quote regardless of array order — the engine dedups and rotates on it.
 *
 * Convention (per the task spec): title = the attributed person, excerpt = the
 * quote text. The LLM expands each seed into the rendered card by slug.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { shortHash } from './idUtils';

const SLUG = 'ai_quote_of_the_day';
const SOURCE = 'Curated';

interface CuratedQuote {
  person: string;
  quote: string;
}

/**
 * Authored set (constant, not user input) of well-attributed quotes. Grown from
 * ~24 to ~42 (2026-08-10, content-supply fix) — deliberately a SMALLER expansion
 * than the sibling ai_tool_of_the_day/claude_code_technique lists: misattributing
 * or mis-quoting a real person is a real accuracy risk this list can't absorb the
 * way a tool catalog can, so only quotes with high confidence in both wording and
 * attribution were added (well-documented historical CS/engineering figures over
 * loosely-remembered paraphrases of contemporary interviews). See
 * ai_tool_of_the_day.ts's catalog-size comment for why list depth matters here —
 * the same 30-day-retention-vs-2/day-consumption math applies.
 */
const QUOTES: readonly CuratedQuote[] = [
  { person: 'Alan Kay', quote: 'The best way to predict the future is to invent it.' },
  { person: 'Fred Brooks', quote: 'Adding manpower to a late software project makes it later.' },
  { person: 'Martin Fowler', quote: 'Any fool can write code that a computer can understand. Good programmers write code that humans can understand.' },
  { person: 'Edsger W. Dijkstra', quote: 'Simplicity is a prerequisite for reliability.' },
  { person: 'Edsger W. Dijkstra', quote: 'The question of whether a computer can think is no more interesting than the question of whether a submarine can swim.' },
  { person: 'Andrew Ng', quote: 'AI is the new electricity.' },
  { person: 'Grace Hopper', quote: "The most dangerous phrase in the language is, 'We've always done it this way.'" },
  { person: 'Melvin Conway', quote: 'Organizations which design systems are constrained to produce designs which are copies of the communication structures of these organizations.' },
  { person: 'Donald Knuth', quote: 'Premature optimization is the root of all evil.' },
  { person: 'Antoine de Saint-Exupéry', quote: 'Perfection is achieved, not when there is nothing more to add, but when there is nothing left to take away.' },
  { person: 'Werner Vogels', quote: 'Everything fails, all the time.' },
  { person: 'Leslie Lamport', quote: "A distributed system is one in which the failure of a computer you didn't even know existed can render your own computer unusable." },
  { person: 'Larry Tesler', quote: "Artificial intelligence is whatever hasn't been done yet." },
  { person: 'Kent Beck', quote: 'Make it work, make it right, make it fast.' },
  { person: 'Linus Torvalds', quote: 'Talk is cheap. Show me the code.' },
  { person: 'Ada Lovelace', quote: 'The Analytical Engine has no pretensions whatever to originate anything. It can do whatever we know how to order it to perform.' },
  { person: 'Marvin Minsky', quote: "You don't understand anything until you learn it more than one way." },
  { person: 'Michael Feathers', quote: 'Legacy code is simply code without tests.' },
  { person: 'Robert C. Martin', quote: 'The only way to go fast is to go well.' },
  { person: 'Rich Hickey', quote: "Programming is not about typing, it's about thinking." },
  { person: 'Peter Drucker', quote: "The greatest danger in times of turbulence is not the turbulence; it is to act with yesterday's logic." },
  { person: 'Bill Gates', quote: 'The first rule of any technology used in a business is that automation applied to an efficient operation will magnify the efficiency.' },
  { person: 'Tim Berners-Lee', quote: 'The Web does not just connect machines, it connects people.' },
  { person: 'John Gall', quote: 'A complex system that works is invariably found to have evolved from a simple system that worked.' },
  { person: 'Grace Hopper', quote: "It's easier to ask forgiveness than it is to get permission." },
  { person: 'Alan Turing', quote: 'We can only see a short distance ahead, but we can see plenty there that needs to be done.' },
  { person: 'Brian Kernighan', quote: 'Debugging is twice as hard as writing the code in the first place. Therefore, if you write the code as cleverly as possible, you are, by definition, not smart enough to debug it.' },
  { person: 'Bjarne Stroustrup', quote: 'C makes it easy to shoot yourself in the foot; C++ makes it harder, but when you do, it blows away your whole leg.' },
  { person: 'Butler Lampson', quote: 'All problems in computer science can be solved by another level of indirection.' },
  { person: 'Alan Perlis', quote: 'A language that doesn’t affect the way you think about programming is not worth knowing.' },
  { person: 'Ward Cunningham', quote: 'A wiki is the simplest online database that could possibly work.' },
  { person: 'Ken Thompson', quote: 'One of my most productive days was throwing away 1000 lines of code.' },
  { person: 'Grady Booch', quote: 'The function of good software is to make the complex appear to be simple.' },
  { person: 'C.A.R. Hoare', quote: 'There are two ways of constructing a software design: one way is to make it so simple that there are obviously no deficiencies, and the other way is to make it so complicated that there are no obvious deficiencies.' },
  { person: 'Barbara Liskov', quote: 'Abstraction is a way of managing complexity by giving things names.' },
  { person: 'Frederick P. Brooks Jr.', quote: 'The bearing of a child takes nine months, no matter how many women are assigned.' },
  { person: 'Eric S. Raymond', quote: 'Given enough eyeballs, all bugs are shallow.' },
  { person: 'Jamie Zawinski', quote: 'Some people, when confronted with a problem, think, "I know, I\'ll use regular expressions." Now they have two problems.' },
];

/** Curated: return the authored quotes as normalized seed items. Never throws. */
export async function collect(): Promise<NormalizedIntelItem[]> {
  try {
    const seen = new Set<string>();
    const items: NormalizedIntelItem[] = [];
    for (const q of QUOTES) {
      const guid = `quote:${shortHash(q.quote)}`;
      if (seen.has(guid)) continue; // guard against an accidental duplicate quote
      seen.add(guid);
      items.push({ guid, source: SOURCE, title: q.person, url: null, excerpt: q.quote, publishedAt: null });
    }
    return items;
  } catch {
    return []; // contract: collect() never throws.
  }
}

registerIntelSource({
  slug: SLUG,
  label: 'AI Quote of the Day',
  enableEnv: 'AI_QUOTE_OF_THE_DAY_INGEST_ENABLED',
  maxPerRunEnv: 'AI_QUOTE_OF_THE_DAY_MAX_PER_RUN',
  collect,
});
