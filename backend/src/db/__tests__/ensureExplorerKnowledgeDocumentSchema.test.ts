/**
 * The store behind Explorer knowledge ingestion.
 *
 * ## The one claim worth testing
 *
 * Storing a document nobody has reviewed is safe ONLY because `confidence` defaults to a
 * state the quote gate already refuses. That is an argument spanning two modules, and a
 * comment asserting it in either one would survive the other changing. So the default is
 * read OUT OF THE DDL TEXT and fed to the real `decideKnowledgeQuote`: change the default
 * to `'grounded'` and this file fails, which is the only way the safety argument stays
 * true rather than merely written down.
 *
 * The rest guards the two things an idempotent-DDL module gets wrong in practice: a
 * statement that is not re-runnable, and a boot call that is present in the text but
 * commented out.
 */

jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn().mockResolvedValue([]) },
}));

import { sequelize } from '../../config/database';
import {
  ensureExplorerKnowledgeDocumentSchema,
  EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS,
} from '../ensureExplorerKnowledgeDocumentSchema';
import { decideKnowledgeQuote } from '../../services/explorerGrowth/explorerKnowledgeQuote';
import type { QuoteCopyRule } from '../../services/explorerGrowth/explorerQuoteGuard';
import type {
  KnowledgeConfidence,
  KnowledgeEntry,
} from '../../services/explorerGrowth/explorerKnowledgeSource';
import { activeBootCall } from './helpers/bootCalls';

const query = sequelize.query as jest.Mock;

/** Every statement as one blob, for assertions about the schema as a whole. */
const ddl = EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS.join('\n');

/** The statement that creates the given table. */
function statementFor(table: string): string {
  const found = EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS.find((s) =>
    s.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
  );
  if (!found) throw new Error(`no CREATE TABLE statement for ${table}`);
  return found;
}

beforeEach(() => {
  query.mockReset();
  query.mockResolvedValue([]);
});

describe('ensureExplorerKnowledgeDocumentSchema — re-runnable, and it says so in SQL', () => {
  it('issues every statement, in declared order', async () => {
    await ensureExplorerKnowledgeDocumentSchema();

    expect(query).toHaveBeenCalledTimes(EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS.length);
    expect(query.mock.calls.map((c) => c[0])).toEqual([
      ...EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS,
    ]);
  });

  it('declares every statement IF NOT EXISTS, so boot is a no-op on an existing database', () => {
    // Boot runs this on every container start. One statement without the guard turns a
    // restart into an error log at best and a failed boot step at worst.
    expect(EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS.length).toBeGreaterThan(0);
    for (const statement of EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS) {
      expect(statement).toContain('IF NOT EXISTS');
    }
  });

  it('issues the same statements on a second run, holding no state between calls', async () => {
    await ensureExplorerKnowledgeDocumentSchema();
    const first = query.mock.calls.map((c) => c[0]);

    query.mockClear();
    await ensureExplorerKnowledgeDocumentSchema();

    expect(query.mock.calls.map((c) => c[0])).toEqual(first);
  });

  it('carries on past a failing statement rather than leaving the rest unrun', async () => {
    // A partial database self-heals: the statement whose object already exists in a
    // conflicting shape fails, and the objects after it are still created. Aborting on the
    // first failure would make one bad row of DDL silently withhold the whole store.
    query.mockRejectedValueOnce(new Error('relation already exists with a different shape'));

    await expect(ensureExplorerKnowledgeDocumentSchema()).resolves.toBeUndefined();

    expect(query).toHaveBeenCalledTimes(EXPLORER_KNOWLEDGE_DOCUMENT_STATEMENTS.length);
  });

  it('never rejects, because a boot step that throws takes the server down with it', async () => {
    query.mockRejectedValue(new Error('database is starting up'));

    await expect(ensureExplorerKnowledgeDocumentSchema()).resolves.toBeUndefined();
  });
});

describe('an ingested document is unquotable until a human says otherwise', () => {
  /** The `confidence` default as the DDL actually declares it. */
  const declaredDefault = (() => {
    const match = statementFor('explorer_knowledge_documents').match(
      /confidence\s+VARCHAR\(\d+\)\s+NOT NULL\s+DEFAULT\s+'([a-z-]+)'/i,
    );
    if (!match) throw new Error('explorer_knowledge_documents declares no confidence default');
    return match[1];
  })();

  /** An entry carrying nothing but the default confidence. */
  function entryAtDefault(): KnowledgeEntry {
    return {
      id: 'ingested-1',
      domain: 'uploaded',
      category: 'policy',
      question: 'What does the uploaded document say?',
      answer: 'Something a reviewer has not looked at yet.',
      detail: '',
      tags: [],
      reference: '',
      referenceLabel: '',
      confidence: declaredDefault as KnowledgeConfidence,
    };
  }

  /**
   * A real rule set, so the copy check RUNS and the entry is not refused for the
   * unrelated `copy_rules_absent` reason. The words are irrelevant to this file's claim;
   * what matters is that the only refusal left standing is the confidence one.
   */
  const COPY_RULES: readonly QuoteCopyRule[] = [
    {
      id: 'test-rule',
      word: 'guaranteed',
      reason: 'promises an outcome.',
      approvedAlternatives: ['designed to'],
    },
  ];

  it('defaults confidence to a state the quote gate refuses', () => {
    // THE SAFETY ARGUMENT, DRIVEN RATHER THAN DESCRIBED. The gate is the real one; the
    // confidence is the real default out of the real DDL. Nothing in between is a stub.
    const decision = decideKnowledgeQuote(entryAtDefault(), { copyRules: COPY_RULES });

    expect(decision.quotable).toBe(false);
    // Exactly one reason, and it is the confidence. `toContain` would also pass if the
    // entry happened to trip a copy or fact rule, which would prove nothing about the
    // default.
    expect(decision.refusals.map((r) => r.code)).toEqual(['confidence_unstated']);
    expect(decision.citation).toBeNull();
  });

  it('records that the confidence check actually ran, so the refusal is not an accident', () => {
    // `quotable: false` can also mean a later check failed. The claim here is specifically
    // that confidence is what stopped it.
    const decision = decideKnowledgeQuote(entryAtDefault(), { copyRules: COPY_RULES });

    expect(decision.checksRun.confidence).toBe(true);
    expect(decision.checksRun.bannedCopy).toBe(true);
  });

  it('does not default to the one state that would make an upload quotable on arrival', () => {
    expect(declaredDefault).not.toBe('grounded');
  });
});

describe('the shape the retrieval path depends on', () => {
  it('dedupes on the content hash, not the filename', () => {
    // The same policy PDF re-sent under a new name is the same document.
    const index = ddl.match(/CREATE UNIQUE INDEX IF NOT EXISTS \w+\s+ON explorer_knowledge_documents[^`]*/);
    expect(index).not.toBeNull();
    expect(index![0]).toContain('sha256');
    expect(index![0]).not.toContain('title');
  });

  it('folds a NULL brand into a concrete value in the dedupe key', () => {
    // NULL never equals NULL in a unique index, so without the COALESCE an unscoped
    // document could be ingested any number of times and the key would be decorative.
    expect(ddl).toMatch(/COALESCE\(brand_id,\s*'0{8}-0{4}-0{4}-0{4}-0{12}'::uuid\)/);
  });

  it('cascades chunk deletion from the document', () => {
    // A chunk outliving its document would be text with no provenance and no approval —
    // exactly the row the gate has no way to reason about.
    expect(statementFor('explorer_knowledge_chunks')).toContain(
      'REFERENCES explorer_knowledge_documents(id) ON DELETE CASCADE',
    );
  });

  it('keys a chunk by its position, so re-ingesting replaces rather than duplicates', () => {
    expect(ddl).toMatch(/UNIQUE INDEX IF NOT EXISTS \w+\s+ON explorer_knowledge_chunks \(document_id, chunk_index\)/);
  });

  it('carries brand_id WITHOUT a foreign key, deliberately', () => {
    // This DDL runs in the Explorer boot block, which is before the multi-tenant modules
    // are guaranteed to have run. `REFERENCES brands(id)` would be a boot error on a fresh
    // database rather than a no-op. The column is present from day one because the plan
    // called out retrofitting it as the thing to avoid.
    expect(statementFor('explorer_knowledge_documents')).toContain('brand_id UUID');
    expect(ddl).not.toMatch(/REFERENCES\s+brands/i);
  });
});

describe('boot wiring', () => {
  it('is called at boot, and not merely mentioned there', () => {
    // `indexOf` matches commented-out text too; `activeBootCall` is the helper that
    // distinguishes a live call from a disabled one.
    expect(activeBootCall('await ensureExplorerKnowledgeDocumentSchema()')).toBeGreaterThan(-1);
  });

  it('runs inside the Explorer block, where its no-foreign-key assumption holds', () => {
    const explorer = activeBootCall('await ensureExplorerGrowthSchema()');
    const multiTenant = activeBootCall('await ensureMultiTenantSchema()');
    const self = activeBootCall('await ensureExplorerKnowledgeDocumentSchema()');

    expect(explorer).toBeGreaterThan(-1);
    expect(multiTenant).toBeGreaterThan(-1);
    // After the Explorer tables it sits beside, and before the multi-tenant module whose
    // absence is precisely why it carries no FK on brand_id.
    expect(self).toBeGreaterThan(explorer);
    expect(self).toBeLessThan(multiTenant);
  });
});
