/**
 * researchPacket - what an intern actually asked, and the places that answer it.
 *
 *     "build the research-packet path, giving the nudge flow read access to source, prod logs and
 *      auth tables"  (Ali, 10 Nov 2026)
 *
 * ## Why a packet and not a better message
 *
 * On 2026-11-10 Ali hand-wrote a reply to Victoria that answered four questions: whether a
 * scheduled agent was running, why a colleague could not get into her own page, what an acronym
 * meant, and who owned a model. Reverse-engineered against the generator, seven of its eight load
 * bearing facts came from places no intern-telemetry collector reaches: our own source, the
 * running container, the permission tables, domain ownership.
 *
 * The lesson was that the shape was wrong, not the dataset. **You cannot pre-collect the answer to
 * a question you have not read yet.** So this does not try to write the answer. It reads the
 * question, pulls out the identifiers in it, resolves each one against the system of record, and
 * hands back evidence with its source attached. A person or a tool-using agent writes the reply.
 *
 * ## Three hard rules
 *
 * 1. **Read only.** Every query here is a SELECT and every file access is a read. Nothing in this
 *    module writes, and nothing it returns is sent anywhere by itself.
 * 2. **Secrets never travel.** Everything resolved passes through `redact()` before it leaves.
 *    A packet becomes a draft email; an API key reaching one would be a disclosure, and the host
 *    rule is that production secrets are read from the container and never pasted anywhere.
 * 3. **Evidence carries its source.** Every finding says where it came from, so the reply can say
 *    "I checked the running container rather than the code" and have that be true.
 */
import * as fs from 'fs';
import * as path from 'path';
import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';

export type LeadKind = 'source' | 'agent' | 'person' | 'domain';

export interface ResearchLead {
  readonly kind: LeadKind;
  /** The identifier found in their question. */
  readonly term: string;
  /** What was resolved, in a sentence a reply could use. */
  readonly finding: string;
  /** Where it came from, named precisely enough to be quoted. */
  readonly evidence: string;
}

export interface ResearchQuestion {
  readonly receivedAt: string;
  readonly subject: string;
  readonly text: string;
}

export interface ResearchPacket {
  readonly enrollmentId: string;
  readonly generatedAt: string;
  readonly questions: readonly ResearchQuestion[];
  readonly leads: readonly ResearchLead[];
  /** Questions nothing could evidence. These are the ones a human has to answer. */
  readonly needsHuman: readonly string[];
  readonly notes: readonly string[];
}

/* ── secrets ──────────────────────────────────────────────────────────────── */

const SECRETISH = /(api[_-]?key|secret|token|password|passwd|authorization|bearer|private[_-]?key|client[_-]?secret|dsn|conn(ection)?[_-]?string)/i;

/**
 * Redact anything that looks like a credential, and anything assigned to a secret-ish name.
 *
 * Deliberately blunt. A false positive costs a line of evidence; a false negative puts a live key
 * in an email draft.
 */
export function redact(s: string): string {
  return s
    .replace(/([A-Za-z0-9_]*(?:key|secret|token|password|passwd)[A-Za-z0-9_]*)\s*[:=]\s*["'`]?[^\s"'`,;}]{6,}/gi, '$1=<redacted>')
    .replace(/\b(sk|pk|ghp|gho|ghs|xox[baprs])[-_][A-Za-z0-9_-]{10,}/g, '<redacted>')
    .replace(/\bBearer\s+[A-Za-z0-9._-]{10,}/gi, 'Bearer <redacted>')
    .replace(/\b[A-Za-z0-9+/]{40,}={0,2}\b/g, '<redacted>');
}

/* ── what to look up ──────────────────────────────────────────────────────── */

const STOP = new Set(['The', 'This', 'That', 'And', 'But', 'For', 'With', 'From', 'When', 'What', 'Where', 'Which', 'Hi', 'Hello', 'Thanks', 'Please', 'Ali', 'I']);

/**
 * The identifiers worth resolving: class and agent names, environment flags, quoted terms.
 *
 * Conservative on purpose. A term that resolves to nothing costs one skipped lookup; a term that
 * matches half the codebase costs a packet full of noise nobody reads.
 */
export function identifiersIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+){1,})\b/g)) out.add(m[1]);   // PascalCase
  for (const m of text.matchAll(/\b([A-Z][A-Z0-9]{3,}(?:_[A-Z0-9]+)+)\b/g)) out.add(m[1]);       // SCREAMING_SNAKE
  for (const m of text.matchAll(/`([^`\n]{3,60})`/g)) out.add(m[1].trim());                       // backticked
  for (const s of out) if (STOP.has(s)) out.delete(s);
  return [...out].slice(0, 12);
}

/** First names mentioned, for the "why can X not get in" question. */
export function peopleIn(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][a-z]{2,15})\b/g)) if (!STOP.has(m[1])) out.add(m[1]);
  return [...out].slice(0, 8);
}

/* ── resolvers, each fail-soft and each naming its source ─────────────────── */

const DIST = '/app/dist';
const MAX_FILES = 4000;

/** Walk the compiled tree once. `dist` keeps every string literal, so cron lines and flags are here. */
function distFiles(root = DIST, acc: string[] = []): string[] {
  if (acc.length >= MAX_FILES) return acc;
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (acc.length >= MAX_FILES) break;
    const p = path.join(root, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules') distFiles(p, acc); }
    else if (e.name.endsWith('.js')) acc.push(p);
  }
  return acc;
}

/**
 * Where a term appears in the SHIPPED code, with the line.
 *
 * Reads `/app/dist` rather than the source tree because the backend container carries the build,
 * not the repository. Compiled JavaScript keeps string literals intact, which is what matters: a
 * cron expression, an environment flag name and a log message template all survive compilation.
 */
export function findInSource(term: string, files?: string[]): ResearchLead | null {
  if (term.length < 4) return null;
  const list = files ?? distFiles();
  for (const f of list) {
    let body: string;
    try { body = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const at = body.indexOf(term);
    if (at < 0) continue;
    const lineNo = body.slice(0, at).split('\n').length;
    const line = (body.split('\n')[lineNo - 1] ?? '').trim().slice(0, 240);
    return {
      kind: 'source',
      term,
      finding: redact(line),
      evidence: `${f.replace('/app/', '')}:${lineNo}, in the image now running`,
    };
  }
  return null;
}

/**
 * Whether a scheduled agent is actually ON.
 *
 * This is the question the Victoria message turned on: the code said the agent was scheduled and
 * the flag was true, and it still was not running, because the scheduler checks `enabled` on the
 * registry row before it fires anything. The code cannot tell you that. The row can.
 */
export async function findAgent(term: string): Promise<ResearchLead | null> {
  type Row = { agent_name: string; enabled: boolean; schedule: string | null; last_run_at: Date | null };
  let row: Row | undefined;
  try {
    // Parameterized, and a SELECT. Bound rather than interpolated even though the term comes from
    // our own extractor, because the extractor reads text an intern wrote.
    const rows = await sequelize.query<Row>(
      `SELECT agent_name, enabled, schedule, last_run_at
         FROM ai_agents
        WHERE agent_name ILIKE $1
        ORDER BY length(agent_name) ASC
        LIMIT 1`,
      { bind: [`%${term}%`], type: QueryTypes.SELECT },
    );
    row = rows[0];
  } catch { return null; }
  if (!row) return null;

  const when = row.last_run_at ? new Date(row.last_run_at).toISOString() : 'never';
  return {
    kind: 'agent',
    term,
    finding: `${row.agent_name} is ${row.enabled ? 'ENABLED' : 'DISABLED'} in the registry. Schedule ${row.schedule ?? 'none'}. Last run ${when}.`,
    evidence: 'ai_agents row in the production database, which is the switch the scheduler checks before it fires',
  };
}

/**
 * What a named colleague can actually open.
 *
 * Roselyn's case: she was never missing an admin login. She held a management role and was missing
 * one section grant, and the platform's own diagnostic reported it as a missing account. Role and
 * extra grants together are what decide access, so both are returned.
 */
export async function findPerson(firstName: string): Promise<ResearchLead | null> {
  type Row = { display_name: string | null; mgmt_role: string | null; mgmt_extra_sections: string[] | null };
  let row: Row | undefined;
  /**
   * Matched at the start of ANY word, plus a five-character prefix fallback.
   *
   * The first version matched `display_name ILIKE 'Firstname %'` and missed three people out of
   * four on live data, each for a different reason:
   *
   *   - **Kes** is stored as a single word, so there is no trailing space to match.
   *   - **Aleem** is "Mohammed Abdul Aleem": the name people use is the LAST token, not the first.
   *   - **Roselyn** is stored "Roselen Flores". People spell colleagues' names from memory, and an
   *     intern writing to Ali is not consulting the user table first.
   *
   * Word-start matching fixes the first two. The five-character prefix fixes the third without
   * opening the door to matching on a fragment: with 22 management records a scan is free, and the
   * alternative is a panel that silently finds nobody.
   */
  const prefix = firstName.slice(0, 5);
  try {
    const rows = await sequelize.query<Row>(
      `SELECT display_name, mgmt_role, mgmt_extra_sections
         FROM community_members
        WHERE mgmt_role IS NOT NULL
          AND (display_name ILIKE $1 OR display_name ILIKE $2
               OR display_name ILIKE $3 OR display_name ILIKE $4)
        ORDER BY length(display_name) ASC
        LIMIT 1`,
      {
        bind: [`${firstName}%`, `% ${firstName}%`, `${prefix}%`, `% ${prefix}%`],
        type: QueryTypes.SELECT,
      },
    );
    row = rows[0];
  } catch { return null; }
  if (!row?.mgmt_role) return null;

  const extra = (row.mgmt_extra_sections ?? []).join(', ') || 'none';
  return {
    kind: 'person',
    term: firstName,
    finding: `${row.display_name ?? firstName} holds the management role "${row.mgmt_role}" with extra section grants: ${extra}. Access is decided by the role's sections plus those grants, not by whether they have an admin account.`
      + ((row.display_name ?? '').toLowerCase().startsWith(firstName.toLowerCase())
        ? ''
        : ` Note the record is filed as "${row.display_name}", which is not quite how the question spelled it.`),
    evidence: 'community_members.mgmt_role and mgmt_extra_sections, the same source requireSection() reads',
  };
}

/** Who is accountable for the agent domain behind a project, so a question can be routed. */
export async function findDomainOwner(projectId: string | null): Promise<ResearchLead | null> {
  if (!projectId) return null;
  try {
    const rows = await sequelize.query<{ agent_name: string | null }>(
      `SELECT aa.agent_name
         FROM agent_domain_projects adp
         JOIN ai_agents aa ON aa.id = adp.agent_id
        WHERE adp.student_project_id = $1
        LIMIT 1`,
      { bind: [projectId], type: QueryTypes.SELECT },
    );
    const name = rows[0]?.agent_name;
    if (!name) return null;
    return {
      kind: 'domain',
      term: name,
      finding: `This project sits under the agent domain "${name}". Route a change against the domain rather than by email, so the decision is recorded where the build can cite it.`,
      evidence: 'agent_domain_projects joined to ai_agents',
    };
  } catch { return null; }
}

/* ── the packet ───────────────────────────────────────────────────────────── */

export interface PacketInputs {
  readonly enrollmentId: string;
  readonly projectId: string | null;
  readonly questions: readonly ResearchQuestion[];
}

/**
 * Resolve every identifier in every unanswered question.
 *
 * The source tree is walked ONCE and the file list reused, because the alternative is a full
 * directory walk per term and a packet that takes longer than the report it came from.
 */
export async function buildResearchPacket(inp: PacketInputs): Promise<ResearchPacket> {
  const leads: ResearchLead[] = [];
  const notes: string[] = [];
  const needsHuman: string[] = [];
  const seen = new Set<string>();

  const files = distFiles();
  if (!files.length) notes.push('No compiled source was readable, so no code references could be resolved.');

  for (const q of inp.questions) {
    const before = leads.length;

    for (const term of identifiersIn(q.text)) {
      if (seen.has(term)) continue;
      seen.add(term);
      const agent = await findAgent(term);
      if (agent) leads.push(agent);
      const src = findInSource(term, files);
      if (src) leads.push(src);
    }

    for (const who of peopleIn(q.text)) {
      if (seen.has(who)) continue;
      seen.add(who);
      const person = await findPerson(who);
      if (person) leads.push(person);
    }

    if (leads.length === before) {
      needsHuman.push(`"${q.subject}" has nothing in it that resolves to a record. This one is a judgement, not a lookup.`);
    }
  }

  const owner = await findDomainOwner(inp.projectId);
  if (owner) leads.push(owner);

  if (!inp.questions.length) notes.push('No unanswered question was found, so there is nothing to research.');

  return {
    enrollmentId: inp.enrollmentId,
    generatedAt: new Date().toISOString(),
    questions: inp.questions.map((q) => ({ ...q, text: redact(q.text) })),
    leads: leads.map((l) => ({ ...l, finding: redact(l.finding), evidence: redact(l.evidence) })),
    needsHuman,
    notes,
  };
}
