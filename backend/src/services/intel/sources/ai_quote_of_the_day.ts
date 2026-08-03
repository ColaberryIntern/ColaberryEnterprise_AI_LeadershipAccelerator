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

/** Authored set (constant, not user input) of ~24 well-attributed quotes. */
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
