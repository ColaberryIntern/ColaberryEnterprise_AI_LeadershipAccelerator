/**
 * SQL-injection heuristic: what it must catch, and what it must NOT.
 *
 * The original pattern was
 *   /`[^`]*\$\{[^}]+\}[^`]*(?:SELECT|INSERT|UPDATE|DELETE|WHERE|FROM)/i
 * and on this repo produced 229 hits of which 213 were noise — 113 console.log
 * lines and 100 prompt/SMS/narrative strings. Two flaws: the /i flag plus lone
 * keywords meant ordinary English matched, because "from", "deleted" and
 * "updated" are common words. A scanner wrong 93% of the time trains people to
 * ignore it, which is worse than not running it at all.
 *
 * Every NEGATIVE case below is a REAL line from this codebase that the old
 * pattern flagged as a critical SQL injection.
 */
import { VULN_PATTERNS } from '../codeSecurityScan';

const sqlPattern = VULN_PATTERNS.find((p) => p.name === 'SQL String Interpolation')!.pattern;

/** The scanner matches per line, so mirror that. */
const flags = (line: string) => sqlPattern.test(line);

describe('SQL String Interpolation heuristic', () => {
  it('is registered as a critical pattern', () => {
    expect(sqlPattern).toBeDefined();
  });

  describe('catches real interpolated SQL', () => {
    it('SELECT ... FROM with an interpolated identifier', () => {
      expect(flags('  const sql = `SELECT ${selectParts.join(\', \')} FROM ${escapeId(tableName)}`;')).toBe(true);
    });

    it('SELECT with interpolated column list and quoted table', () => {
      expect(flags('  sql: `SELECT ${colList} FROM "${table}" ORDER BY created_at DESC LIMIT 20`,')).toBe(true);
    });

    it('INSERT INTO', () => {
      expect(flags('  await db.query(`INSERT INTO ${table} (a, b) VALUES ($1, $2)`);')).toBe(true);
    });

    it('UPDATE ... SET', () => {
      expect(flags('  const q = `UPDATE ${table} SET status = $1 WHERE id = $2`;')).toBe(true);
    });

    it('DELETE FROM', () => {
      expect(flags('  const q = `DELETE FROM ${table} WHERE id = ${id}`;')).toBe(true);
    });
  });

  describe('does NOT flag prose — every line here was a real false positive', () => {
    it('console.log containing the word "deleted"', () => {
      expect(flags('    console.log(`[Admin] Lead ${id} (${redactForLogs(lead.name)}) deleted by admin`);')).toBe(false);
    });

    it('console.log containing the word "from"', () => {
      expect(flags('      console.log(`[StrategyPrep] Extracted ${extractedText.length} chars from ${file.originalname}`);')).toBe(false);
    });

    it('console.log containing "Unenrolled ... from"', () => {
      expect(flags('  console.log(`[Synthflow Webhook] Unenrolled lead ${commLog.lead_id} from ${prevCampaignId}`);')).toBe(false);
    });

    it('an SMS body mentioning a company name after "from"', () => {
      expect(flags('  const smsBody = `Hi ${firstName}, this is Maya from Colaberry Enterprise AI.`;')).toBe(false);
    });

    it('a narrative string using "from ... to"', () => {
      expect(flags('    narrative = `${readableTable} has ${direction} from ${first} to ${last}`;')).toBe(false);
    });

    it('an agent prompt containing "updated"', () => {
      expect(flags('      prompt_text: `${preamble}# OBJECTIVE\\n\\nThe process ${process.name} was updated`,')).toBe(false);
    });
  });

  describe('boundary behaviour', () => {
    it('ignores a fully static SQL string — no interpolation, no injection risk', () => {
      expect(flags('  const q = `SELECT id FROM users WHERE active = true`;')).toBe(false);
    });

    it('does not treat UPDATED/SETTINGS as UPDATE ... SET', () => {
      expect(flags('  console.log(`UPDATED ${count} SETTINGS for ${user}`);')).toBe(false);
    });

    it('is case-sensitive: lowercase sql keywords in prose do not match', () => {
      expect(flags('  console.log(`select ${a} from ${b}`);')).toBe(false);
    });
  });
});
