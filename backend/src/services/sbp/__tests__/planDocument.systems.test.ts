/**
 * systemsOfRecord — the tooling-is-not-a-system regression.
 *
 * The extractor scrapes capitalised proper nouns out of CONSTRAINT statements,
 * which is the right instinct (students write "read the agreement FROM
 * HelloSign") and the wrong one for a toolchain. On 2026-08-20 a student's
 * Command Center listed "Claude Code" in "Systems — what this connects to",
 * with a live connection indicator beside it, because his plan carried a
 * CONSTRAINT saying the project must be built with Claude Code. He asked for
 * his whole project to be deleted over it.
 *
 * The bug is not one student's data. Any capitalised tool name in a CONSTRAINT
 * lands in that list, so GitHub, Docker and Python were all one plausible
 * sentence away from the same thing.
 *
 * These tests pin both halves: real systems still survive, tooling does not.
 */
import { PlanRequirement } from '../planContract';
import { systemsOfRecord } from '../planDocument';

let seq = 0;
const constraint = (statement: string): PlanRequirement => ({
  id: `CON-${String(++seq).padStart(3, '0')}`,
  kind: 'CONSTRAINT',
  statement,
  priority: 'MUST',
} as PlanRequirement);

describe('systemsOfRecord', () => {
  describe('keeps real systems of record', () => {
    it('finds a single-word proper noun at the end of a clause', () => {
      expect(systemsOfRecord([constraint('The agent must read the signed agreement from HelloSign.')]))
        .toContain('HelloSign');
    });

    it('finds a two-word system name', () => {
      expect(systemsOfRecord([constraint('Appointments must be written to Google Calendar.')]))
        .toContain('Google Calendar');
    });

    it('deduplicates a system named in more than one constraint', () => {
      const out = systemsOfRecord([
        constraint('Reads from Salesforce.'),
        constraint('Writes back to Salesforce.'),
      ]);
      expect(out.filter((s) => s === 'Salesforce')).toHaveLength(1);
    });

    it('ignores requirements that are not CONSTRAINT', () => {
      const nfr = { ...constraint('Must respond via Twilio.'), kind: 'NFR' } as PlanRequirement;
      expect(systemsOfRecord([nfr])).toEqual([]);
    });
  });

  describe('drops build tooling', () => {
    // The exact shape that reached production.
    it('drops "Claude Code" when both words are capitalised', () => {
      const out = systemsOfRecord([constraint('The system must be built with Claude Code.')]);
      expect(out).not.toContain('Claude Code');
      expect(out).not.toContain('Claude');
    });

    // The extractor's two-word group only fires when BOTH words are capitalised,
    // so this sentence yields a bare "Claude" and needs the leading-word check.
    it('drops a bare "Claude" when the student writes "Claude code"', () => {
      expect(systemsOfRecord([constraint('All work is done in Claude code.')])).not.toContain('Claude');
    });

    it.each([
      ['GitHub', 'Source lives in GitHub.'],
      ['Docker', 'Deployed with Docker.'],
      ['Python', 'Written in Python.'],
      ['ChatGPT', 'Drafted using ChatGPT.'],
      ['VS Code', 'Edited in VS Code.'],
    ])('drops %s', (tool, statement) => {
      expect(systemsOfRecord([constraint(statement)])).not.toContain(tool);
    });

    it('keeps the real system when a constraint names both a tool and a system', () => {
      const out = systemsOfRecord([
        constraint('Built with Claude Code, and it must write results back to Salesforce.'),
      ]);
      expect(out).toContain('Salesforce');
      expect(out).not.toContain('Claude Code');
    });

    it('leaves nothing at all when the only proper nouns are tooling', () => {
      expect(systemsOfRecord([constraint('Built with Claude Code and deployed with Docker.')])).toEqual([]);
    });
  });
});
