/**
 * toolDuplicateCheck — "do we already have a tool that does this?", answered deterministically,
 * with the reason shown.
 *
 * AF11.2. Ali, 3 Nov 2026: *"I should also be able to analyze from their request if we already
 * have a tool that exists that can do what they want, I can recommend / assign that tool to the
 * agent."*
 *
 * ## Why this file is pure, and why it is not a model call
 *
 * The ticket is explicit: *"Deterministic and explainable, not a model guess."* A model asked
 * twice can answer twice differently, which makes the stored answer and the recomputed answer
 * disagree, and an approver who has been shown two different answers for one request stops
 * trusting both. Everything here is a function of (request, catalog) and nothing else: no clock,
 * no I/O, no randomness, no network. The catalog is passed in, so the caller owns the one read.
 *
 * ## What this is ADVICE about, and what it can never do
 *
 * Out of scope by the ticket's own words, and enforced by this file having no write path and no
 * refusal vocabulary: it never assigns a tool (*"a recommendation is not a grant, and collapsing
 * the two would mean an agent gains a tool because a string matched"*), and it never rejects a
 * request (*"the match is advice to the approver, never a refusal"*). `gateToolRequest` in
 * `toolRequestContract.ts` is the only thing in this subtree that may refuse anything, and it does
 * not call this.
 *
 * ## THE FAILURE MODE THIS FILE IS DESIGNED AGAINST
 *
 * The ticket names it: *"A matcher tuned so that everything looks like a duplicate. It would pass
 * its own happy-path test, read as thorough, and train Ali to ignore it within a week."*
 *
 * The defence is `COMMON_TOKEN_SHARE` plus rarity weighting. A word that most of the catalog uses
 * explains nothing: `ticket`, `row`, `agent` and `record` are what this catalog is made of, so
 * matching on them would make all 57 tools candidates for every request. Such a word is dropped
 * outright and recorded as dropped, and the survivors are weighted so a word two tools use counts
 * for far more than a word fifteen use. The scores a request can reach are therefore bounded by
 * how DISTINCTIVE its vocabulary is, not by how much of it there is.
 *
 * The matching converse is also designed for: a request whose words appear nowhere in the catalog
 * keeps those words in the DENOMINATOR at full weight and can never put them in the numerator, so
 * a genuinely novel request is driven toward zero by construction rather than by a tuned cut-off.
 *
 * ## The catalog has no `purpose`, and this file says so rather than pretending otherwise
 *
 * `ToolCapability` in `services/reese/agentToolCapabilities.ts` is `{ reads, produces }` and
 * nothing else. The ticket describes the request and the catalog as carrying "the same four
 * fields"; three of them exist on both sides and `purpose` exists only on the request, which
 * `toolRequestContract.ts` already records in its own header. So the request's `purpose` is
 * compared against the tool's BEHAVIOR text, and the matched field is named
 * `purpose_vs_behavior` rather than `purpose`. Naming it `purpose` would claim a comparison that
 * did not happen, which is the kind of label an approver cannot audit.
 *
 * ## Measured in production on 2026-11-04, because the ticket's figures are stale
 *
 * `buildToolCatalog()` returns **57** tools, not the 47 the ticket states. 53 are documented and
 * **4 carry no `reads` and no `produces` at all** (`assignHandoff`, `materializeHandoffs`,
 * `rankQueue`, `read_attachments`). Those four are unmatchable on behavior by construction, so
 * they are reported in `behaviorless_tools` on every result. Without that disclosure, a request
 * that duplicates one of them would surface nothing and read as novel, and
 * `CLAUDE.md`'s own rule applies: an absence is indistinguishable from a broken detector unless
 * something says which it is.
 */

/**
 * One tool as the matcher needs it. A catalog entry with empty `reads` and `produces` is legal and
 * meaningful: it is a tool nobody documented, matchable by name only.
 */
export interface CatalogTool {
  readonly tool_name: string;
  readonly reads: ReadonlyArray<string>;
  readonly produces: ReadonlyArray<string>;
  /** Known other names for this tool. No alias registry exists today, so this is usually empty. */
  readonly aliases?: ReadonlyArray<string>;
}

/** The side of a request this matcher reads. Deliberately narrower than `ToolRequestDetail`. */
export interface DuplicateCheckRequest {
  readonly tool_name: string;
  readonly purpose: string;
  readonly reads: ReadonlyArray<string>;
  readonly produces: ReadonlyArray<string>;
}

export type MatchedFieldName =
  /** The names are the same once case and separators are normalized away. */
  | 'tool_name'
  /** The names share distinguishing words, or their leading verbs are known synonyms. */
  | 'tool_name_tokens'
  /** What the request says it READS overlaps what the tool reads. */
  | 'reads'
  /** What the request says it PRODUCES overlaps what the tool produces. */
  | 'produces'
  /** The request's purpose overlaps the tool's behavior text. The catalog has no purpose field. */
  | 'purpose_vs_behavior';

/**
 * Why one field matched, in words an approver can check against the tool.
 *
 * `tokens` is the evidence and `detail` is the sentence. A score with no named field is the thing
 * the ticket forbids: *"A bare similarity score is not an explanation, and Ali cannot audit a
 * number."*
 */
export interface MatchedField {
  readonly field: MatchedFieldName;
  readonly detail: string;
  readonly tokens: ReadonlyArray<string>;
  /** This field's own 0..1 coverage, before the field weight is applied. */
  readonly coverage: number;
}

export interface DuplicateCandidate {
  readonly tool_name: string;
  /** 0..1, rounded to four places so the stored row is byte-stable across recomputation. */
  readonly score: number;
  readonly matched_fields: ReadonlyArray<MatchedField>;
}

export interface DuplicateCheckResult {
  /** Ranked, highest first, ties broken by name so the order is stable. */
  readonly candidates: ReadonlyArray<DuplicateCandidate>;
  /** How many tools were compared. A result computed against an empty catalog is not a clean one. */
  readonly catalog_size: number;
  /** The cut-off this result used, stored so an answer can be read back years later. */
  readonly threshold: number;
  /** Tools with no behavior text: matchable by name only, and said so rather than silently missed. */
  readonly behaviorless_tools: ReadonlyArray<string>;
  /** Words dropped as too common to explain anything, with the share of the catalog using each. */
  readonly ignored_common_tokens: ReadonlyArray<{ token: string; share: number }>;
  /** Set when the catalog itself was unusable, so a zero-candidate result cannot read as "novel". */
  readonly catalog_absent: boolean;
}

/**
 * A word used by at least this share of the catalog is dropped.
 *
 * Tuned against the real 57-tool catalog rather than chosen: at 0.25 the dropped set is the
 * vocabulary the catalog is built out of (`ticket`, `row`, `agent`, `record`, `status`), which is
 * exactly the set that would otherwise make every tool a candidate for every request. This is one
 * of the two knobs the ticket requires mutation-proving in both directions; the other is
 * `DEFAULT_THRESHOLD`.
 *
 * ON A VERY SMALL CATALOG THIS FAILS CLOSED, and that is the intended direction. With two tools, a
 * word they share is a word 100% of the catalog uses, so every shared word is dropped and nothing
 * matches at all. The alternative is a two-tool catalog in which everything matches everything,
 * which is the failure that trains an approver to ignore the feature. `catalog_size` on the result
 * is how a reader sees which case they are in. Production is nowhere near it: at 57 tools a word
 * must appear in 15 of them before it is dropped.
 *
 * WHERE IT ACTUALLY EARNS ITS KEEP, measured rather than assumed. The rarity weight is
 * `log(N/df)/log(N)`, which is ALREADY ZERO when a word is in every tool, so the hard drop adds
 * nothing at the extreme. Its whole contribution is the band between this ceiling and 100%: a word
 * in half the catalog would otherwise carry a weight of 0.279 and make every tool using it a
 * candidate. A first draft of the test for this used a fully uniform catalog, expected twelve
 * matches when the guard was loosened, and got none — because the weighting had already done the
 * job and the guard had nothing left to do. The test now sits in the band where the two differ.
 */
export const COMMON_TOKEN_SHARE = 0.25;

/**
 * The cut-off a candidate must beat to be shown at all.
 *
 * An exact name match alone scores `FIELD_WEIGHTS.tool_name` = 0.4 and clears this comfortably,
 * which is the intended behavior: the same name is the least arguable duplicate there is. Three
 * weak behavioral overlaps and no name overlap do not clear it, which is also intended, because
 * that is the shape a tuned-to-match-everything matcher produces.
 */
export const DEFAULT_THRESHOLD = 0.2;

/** At most this many candidates. The ticket's acceptance criterion is stated in terms of a top three. */
export const DEFAULT_MAX_CANDIDATES = 3;

/**
 * Field weights, summing to 1.
 *
 * The name carries the most because two tools with the same name are the same tool in all but
 * record-keeping. `purpose_vs_behavior` carries the least BECAUSE it is the cross-field
 * comparison: the catalog has no purpose, so this is the one signal comparing unlike things, and
 * it is weighted like a hint rather than evidence.
 */
export const FIELD_WEIGHTS: Readonly<Record<MatchedFieldName, number>> = {
  tool_name: 0.4,
  tool_name_tokens: 0.15,
  reads: 0.2,
  produces: 0.2,
  purpose_vs_behavior: 0.05,
};

/**
 * Words carrying no domain meaning in this catalog. Deliberately short: the real defence against
 * common words is `COMMON_TOKEN_SHARE`, which is MEASURED from the catalog, while a hand-written
 * list is a guess that goes stale. This list only removes grammar.
 */
const STOPWORDS: ReadonlySet<string> = new Set([
  'the', 'and', 'for', 'from', 'with', 'that', 'this', 'into', 'onto', 'its', 'has', 'have',
  'are', 'was', 'were', 'any', 'all', 'one', 'two', 'per', 'via', 'when', 'where', 'which',
  'what', 'who', 'how', 'why', 'not', 'but', 'own', 'out', 'off', 'only', 'each', 'both',
  'already', 'rather', 'than', 'then', 'also', 'more', 'most', 'less', 'least', 'same',
  'other', 'another', 'every', 'their', 'them', 'they', 'it', 'is', 'of', 'in', 'on', 'to',
  'a', 'an', 'or', 'by', 'at', 'as', 'be', 'so', 'no', 'new', 'old',
]);

/**
 * Leading verbs that mean the same thing, so `fetch_attachments` can match `read_attachments`.
 *
 * This is what the ticket's "known aliases" can honestly mean today: there is no alias registry,
 * and inventing one would be a data file nobody maintains. A synonym applied to the LEADING verb
 * only is a rule, not a dataset, and the matched field says which verb was folded into which.
 */
const VERB_SYNONYMS: ReadonlyMap<string, string> = new Map(Object.entries({
  read: 'read', get: 'read', fetch: 'read', query: 'read', load: 'read', retrieve: 'read',
  list: 'read', lookup: 'read', inspect: 'read',
  create: 'create', make: 'create', add: 'create', new: 'create', generate: 'create',
  open: 'create', file: 'create', raise: 'create',
  update: 'update', edit: 'update', change: 'update', modify: 'update', set: 'update',
  patch: 'update', sync: 'update',
  delete: 'delete', remove: 'delete', drop: 'delete', purge: 'delete',
  send: 'send', deliver: 'send', email: 'send', notify: 'send', alert: 'send', post: 'send',
  detect: 'detect', check: 'detect', scan: 'detect', monitor: 'detect', watch: 'detect',
  find: 'detect', flag: 'detect', assess: 'detect', evaluate: 'detect', audit: 'detect',
  close: 'close', resolve: 'close', complete: 'close', finish: 'close',
  assign: 'assign', grant: 'assign', attach: 'assign', link: 'assign',
}));

/** `assignHandoff`, `assign_handoff` and `Assign Handoff` are one name. */
function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Split text into comparable words. camelCase is split BEFORE lowering, which is the only chance
 * to see the boundary in `materializeHandoffs`.
 */
function tokenize(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t))
    .map(stem);
}

/**
 * Crude, deliberately: `tickets` and `ticket` are one word, and `status` is not `statu`.
 *
 * The guard on `ss`, `us` and `is` endings is the whole of the cleverness. A real stemmer would be
 * a dependency, and `CLAUDE.md` forbids a drive-by one for a single plural rule.
 */
function stem(token: string): string {
  if (token.length < 5) return token;
  if (/(ss|us|is)$/.test(token)) return token;
  return token.endsWith('s') ? token.slice(0, -1) : token;
}

/** Everything a tool says about itself, as one bag of words. */
function toolText(tool: CatalogTool): string {
  return [tool.tool_name, ...(tool.aliases ?? []), ...tool.reads, ...tool.produces].join(' ');
}

interface Rarity {
  /** 0 for a word no tool uses, through 1 for a word exactly one tool uses. */
  weight(token: string): number;
  dropped: Array<{ token: string; share: number }>;
}

/**
 * How much each word is worth, measured from the catalog rather than assumed.
 *
 * A word no tool uses gets the MAXIMUM weight on purpose. It can never appear in a numerator, so
 * full weight in the denominator is what makes a novel request score low without any rule saying
 * "novel requests score low".
 */
function rarityOf(catalog: ReadonlyArray<CatalogTool>, commonShare: number): Rarity {
  const size = catalog.length;
  const df = new Map<string, number>();
  for (const tool of catalog) {
    for (const token of new Set(tokenize(toolText(tool)))) {
      df.set(token, (df.get(token) ?? 0) + 1);
    }
  }
  const dropped: Array<{ token: string; share: number }> = [];
  const cache = new Map<string, number>();
  const ceiling = Math.log(Math.max(size, 2));

  const weight = (token: string): number => {
    const cached = cache.get(token);
    if (cached !== undefined) return cached;
    const seen = df.get(token) ?? 0;
    let value: number;
    if (seen === 0) {
      value = 1;
    } else if (size > 0 && seen / size >= commonShare) {
      value = 0;
      dropped.push({ token, share: round(seen / size) });
    } else {
      value = round(Math.min(1, Math.log(size / seen) / ceiling));
    }
    cache.set(token, value);
    return value;
  };
  return { weight, dropped };
}

/** Four places, so recomputing the same inputs produces the same bytes. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * What share of the request's distinguishing vocabulary this tool already covers.
 *
 * Coverage, not similarity, and the asymmetry is the point: the question is whether an existing
 * tool already does what was asked for, so a large tool that covers a small request IS a
 * duplicate, while a small tool covering a fraction of a large request is not.
 */
function coverage(
  requestTokens: ReadonlyArray<string>,
  toolTokens: ReadonlySet<string>,
  rarity: Rarity,
): { value: number; matched: string[] } {
  let wanted = 0;
  let found = 0;
  const matched: string[] = [];
  for (const token of new Set(requestTokens)) {
    const weight = rarity.weight(token);
    if (weight === 0) continue;
    wanted += weight;
    if (toolTokens.has(token)) {
      found += weight;
      matched.push(token);
    }
  }
  if (wanted === 0) return { value: 0, matched: [] };
  return { value: round(Math.min(1, found / wanted)), matched: matched.sort() };
}

/** The leading verb, folded onto its synonym. `undefined` when the first word is not a known verb. */
function leadingVerb(name: string): string | undefined {
  const first = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)[0];
  return first ? VERB_SYNONYMS.get(first) : undefined;
}

/** The name with its leading verb folded onto the synonym, for alias comparison. */
function verbFoldedName(name: string): string | undefined {
  const parts = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/)
    .filter((p) => p.length > 0);
  if (parts.length < 2) return undefined;
  const folded = VERB_SYNONYMS.get(parts[0]);
  return folded ? [folded, ...parts.slice(1)].join('') : undefined;
}

function nameFieldFor(request: DuplicateCheckRequest, tool: CatalogTool): MatchedField | null {
  const requested = normalizeName(request.tool_name);
  const names = [tool.tool_name, ...(tool.aliases ?? [])];
  for (const name of names) {
    if (normalizeName(name) === requested) {
      return {
        field: 'tool_name',
        detail: name === tool.tool_name
          ? `The names are the same once case and separators are ignored: "${request.tool_name}" and "${tool.tool_name}".`
          : `"${request.tool_name}" is a known alias of "${tool.tool_name}".`,
        tokens: [requested],
        coverage: 1,
      };
    }
  }
  const foldedRequest = verbFoldedName(request.tool_name);
  if (foldedRequest) {
    for (const name of names) {
      if (verbFoldedName(name) === foldedRequest) {
        const verb = leadingVerb(request.tool_name);
        return {
          field: 'tool_name',
          detail: `The names match once the leading verb is folded onto its synonym "${verb}": `
            + `"${request.tool_name}" and "${name}".`,
          tokens: [foldedRequest],
          coverage: 1,
        };
      }
    }
  }
  return null;
}

export interface CheckForDuplicateToolArgs {
  readonly request: DuplicateCheckRequest;
  /** Read by the caller, so this module stays pure. An empty catalog is reported, not passed off. */
  readonly catalog: ReadonlyArray<CatalogTool>;
  readonly threshold?: number;
  readonly maxCandidates?: number;
  /**
   * Overrides `COMMON_TOKEN_SHARE`. Present for the same reason `threshold` is: a knob that
   * cannot be moved from outside can only be mutation-proved by editing the source, and a
   * source edit cannot be left behind as a test. Measured 2026-11-04: against the real 57-tool
   * catalog, LOOSENING this changed no behavior at all, because almost no word crosses 25% of
   * 57 tools. The direction was therefore unpinned until it became an argument.
   */
  readonly commonTokenShare?: number;
}

/**
 * Compare one request against the whole catalog and return the closest matches, each carrying the
 * reason it matched.
 *
 * Returns the candidates ONLY; it has no opinion about what should happen next, because the ticket
 * puts both of the available opinions out of scope.
 */
export function checkForDuplicateTool(args: CheckForDuplicateToolArgs): DuplicateCheckResult {
  const { request, catalog } = args;
  const threshold = args.threshold ?? DEFAULT_THRESHOLD;
  const maxCandidates = args.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
  const commonShare = args.commonTokenShare ?? COMMON_TOKEN_SHARE;

  const behaviorless = catalog
    .filter((t) => t.reads.length === 0 && t.produces.length === 0)
    .map((t) => t.tool_name)
    .sort();

  if (catalog.length === 0) {
    // An empty catalog cannot clear a request. Saying so is the difference between "we compared
    // this against everything and found nothing" and "we compared it against nothing".
    return {
      candidates: [],
      catalog_size: 0,
      threshold,
      behaviorless_tools: [],
      ignored_common_tokens: [],
      catalog_absent: true,
    };
  }

  const rarity = rarityOf(catalog, commonShare);
  const requestNameTokens = tokenize(request.tool_name);
  const requestReads = tokenize(request.reads.join(' '));
  const requestProduces = tokenize(request.produces.join(' '));
  const requestPurpose = tokenize(request.purpose);

  const scored: DuplicateCandidate[] = [];
  for (const tool of catalog) {
    const fields: MatchedField[] = [];

    const nameField = nameFieldFor(request, tool);
    if (nameField) fields.push(nameField);

    const nameTokens = new Set(tokenize([tool.tool_name, ...(tool.aliases ?? [])].join(' ')));
    const readTokens = new Set(tokenize(tool.reads.join(' ')));
    const produceTokens = new Set(tokenize(tool.produces.join(' ')));
    const behaviorTokens = new Set([...readTokens, ...produceTokens]);

    if (!nameField) {
      const hit = coverage(requestNameTokens, nameTokens, rarity);
      if (hit.value > 0) {
        fields.push({
          field: 'tool_name_tokens',
          detail: `The two names share ${describeTokens(hit.matched)}.`,
          tokens: hit.matched,
          coverage: hit.value,
        });
      }
    }

    const readHit = coverage(requestReads, readTokens, rarity);
    if (readHit.value > 0) {
      fields.push({
        field: 'reads',
        detail: `What this tool reads already covers ${describeTokens(readHit.matched)} `
          + 'from what the request says it needs to read.',
        tokens: readHit.matched,
        coverage: readHit.value,
      });
    }

    const produceHit = coverage(requestProduces, produceTokens, rarity);
    if (produceHit.value > 0) {
      fields.push({
        field: 'produces',
        detail: `What this tool produces already covers ${describeTokens(produceHit.matched)} `
          + 'from what the request says it would produce.',
        tokens: produceHit.matched,
        coverage: produceHit.value,
      });
    }

    const purposeHit = coverage(requestPurpose, behaviorTokens, rarity);
    if (purposeHit.value > 0) {
      fields.push({
        field: 'purpose_vs_behavior',
        detail: `The request's stated purpose shares ${describeTokens(purposeHit.matched)} `
          + "with this tool's recorded behavior. The catalog holds no purpose field, so this "
          + 'compares the purpose against what the tool reads and produces.',
        tokens: purposeHit.matched,
        coverage: purposeHit.value,
      });
    }

    if (fields.length === 0) continue;
    const score = round(fields.reduce((sum, f) => sum + FIELD_WEIGHTS[f.field] * f.coverage, 0));
    if (score < threshold) continue;
    scored.push({ tool_name: tool.tool_name, score, matched_fields: fields });
  }

  scored.sort((a, b) => (b.score - a.score) || a.tool_name.localeCompare(b.tool_name));

  return {
    candidates: scored.slice(0, maxCandidates),
    catalog_size: catalog.length,
    threshold,
    behaviorless_tools: behaviorless,
    ignored_common_tokens: dedupeDropped(rarity.dropped),
    catalog_absent: false,
  };
}

function describeTokens(tokens: ReadonlyArray<string>): string {
  const quoted = tokens.map((t) => `"${t}"`);
  if (quoted.length === 1) return quoted[0];
  return `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

function dedupeDropped(
  dropped: ReadonlyArray<{ token: string; share: number }>,
): Array<{ token: string; share: number }> {
  const seen = new Map<string, number>();
  for (const d of dropped) seen.set(d.token, d.share);
  return [...seen.entries()]
    .map(([token, share]) => ({ token, share }))
    .sort((a, b) => (b.share - a.share) || a.token.localeCompare(b.token));
}
