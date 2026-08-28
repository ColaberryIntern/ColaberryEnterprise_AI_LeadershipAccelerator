/**
 * capabilityRepoReader — reading a student's real repository instead of their uploads.
 *
 * The counting test is the one that matters. `.claude/skills/` with 32 tree entries
 * is not 32 skills, and a capability whose floor is 3 must not be satisfied by one
 * skill that happens to contain three files. An inflated count on a portfolio is
 * worse than no count.
 */
import { capstoneProgress, isComplete, mergeInventory } from '../capabilityInventory';
import { countImmediateChildren, observeCapabilities, pathPresent } from '../capabilityRepoReader';

const t = (...paths: string[]) => paths.map((path) => ({ path, type: path.endsWith('/') ? 'tree' : 'blob' }));
const entry = (inv: { entries: any[] }, id: string) => inv.entries.find((e) => e.id === id);

describe('countImmediateChildren', () => {
  it('counts things, not files — three skills in nine files is three', () => {
    const paths = [
      '.claude/skills/summarise/SKILL.md', '.claude/skills/summarise/README.md', '.claude/skills/summarise/eval.json',
      '.claude/skills/triage/SKILL.md', '.claude/skills/triage/README.md', '.claude/skills/triage/notes.md',
      '.claude/skills/draft/SKILL.md', '.claude/skills/draft/README.md', '.claude/skills/draft/x.md',
    ];
    expect(countImmediateChildren(paths, '.claude/skills/')).toBe(3);
  });

  it('counts a file-per-item layout the same way as a folder-per-item one', () => {
    // Agents are files; skills are folders. Neither is special-cased.
    expect(countImmediateChildren(
      ['.claude/agents/reviewer.md', '.claude/agents/tester.md', '.claude/agents/scorer.md'],
      '.claude/agents/',
    )).toBe(3);
  });

  it('does not count the prefix directory itself', () => {
    expect(countImmediateChildren(['.claude/skills', '.claude/skills/'], '.claude/skills/')).toBe(0);
  });

  it('is not fooled by a neighbouring path that merely starts the same', () => {
    expect(countImmediateChildren(['.claude/skills-backup/old.md'], '.claude/skills/')).toBe(0);
  });

  it('tolerates a leading ./ and a missing trailing slash on the prefix', () => {
    expect(countImmediateChildren(['./.claude/agents/a.md'], '.claude/agents')).toBe(1);
  });
});

describe('pathPresent', () => {
  it('matches an exact file', () => {
    expect(pathPresent(['CLAUDE.md', 'README.md'], 'CLAUDE.md')).toBe(true);
  });

  it('matches anything under a directory', () => {
    expect(pathPresent(['mcp-server/src/server.py'], 'mcp-server/')).toBe(true);
  });

  it('does not match a prefix that is only a name collision', () => {
    expect(pathPresent(['mcp-server-notes.md'], 'mcp-server/')).toBe(false);
    expect(pathPresent(['CLAUDE.md.bak'], 'CLAUDE.md')).toBe(false);
  });
});

describe('observeCapabilities', () => {
  it('finds the work a real student already has', () => {
    // Modelled on a real repo read from production: CLAUDE.md plus a populated
    // .claude/skills/. Neither is visible on the portfolio today.
    const inv = observeCapabilities('enr-1', t(
      'CLAUDE.md',
      '.claude/skills/summarise/SKILL.md',
      '.claude/skills/triage/SKILL.md',
      '.claude/skills/draft/SKILL.md',
    ));
    expect(entry(inv, 'WORKSPACE')).toMatchObject({ present: true, count: 1 });
    expect(entry(inv, 'SKILLS')).toMatchObject({ present: true, count: 3 });
    expect(isComplete(entry(inv, 'SKILLS'))).toBe(true);
  });

  it('reports a collection below its floor as present but incomplete', () => {
    // Honest: they started, they are not done. Not the same as absent.
    const inv = observeCapabilities('enr-1', t('.claude/agents/reviewer.md'));
    expect(entry(inv, 'AGENTS')).toMatchObject({ present: true, count: 1 });
    expect(isComplete(entry(inv, 'AGENTS'))).toBe(false);
  });

  it('needs run evidence before a service counts as done', () => {
    const codeOnly = observeCapabilities('enr-1', t('mcp-server/src/server.py'));
    expect(entry(codeOnly, 'MCP_SERVER')).toMatchObject({ present: true, proven: false });
    expect(isComplete(entry(codeOnly, 'MCP_SERVER'))).toBe(false);

    const withRun = observeCapabilities('enr-1', t('mcp-server/src/server.py', 'artifacts/week-05/inspector.mp4'));
    expect(entry(withRun, 'MCP_SERVER')).toMatchObject({ present: true, proven: true });
    expect(isComplete(entry(withRun, 'MCP_SERVER'))).toBe(true);
  });

  it('does NOT accept a mirrored document as proof a server ran', () => {
    // Caught on the first production run: Quincy's artifacts/week-05/ holds
    // `mcp-server-configuration.csv`, a platform-mirrored document, and the
    // reader scored his MCP server as proven on the strength of it. That folder
    // receives uploads as well as recordings, so presence alone is not the claim.
    const mirrored = observeCapabilities('enr-1', t(
      'mcp-server/src/server.py',
      'artifacts/week-05/mcp-server-configuration.csv',
      'artifacts/week-05/notes.md',
    ));
    expect(entry(mirrored, 'MCP_SERVER')).toMatchObject({ present: true, proven: false });
    expect(isComplete(entry(mirrored, 'MCP_SERVER'))).toBe(false);
  });

  it('accepts any real recording format, case-insensitively', () => {
    for (const file of ['demo.MP4', 'session.mov', 'run.webm', 'clip.gif', 'walkthrough.m4a']) {
      const inv = observeCapabilities('enr-1', t('mcp-server/src/server.py', `artifacts/week-05/${file}`));
      expect(entry(inv, 'MCP_SERVER').proven).toBe(true);
    }
  });

  it('returns absent capabilities rather than omitting them', () => {
    // The merge ratchets from these, and a caller should be able to render
    // "not yet" without inferring it from a missing key.
    const inv = observeCapabilities('enr-1', t('CLAUDE.md'));
    expect(entry(inv, 'GOVERNANCE')).toMatchObject({ present: false, count: 0 });
  });

  it('never observes the composite', () => {
    expect(entry(observeCapabilities('enr-1', t('CLAUDE.md')), 'CAPSTONE')).toBeUndefined();
  });

  it('survives an empty tree', () => {
    const inv = observeCapabilities('enr-1', []);
    expect(inv.entries.every((e) => e.present === false)).toBe(true);
  });
});

describe('together with the inventory merge', () => {
  it('an unreadable repo cannot take away what was already seen', () => {
    // The whole reason the merge ratchets. A failed read, or a student
    // refactoring a folder, must not erase credit they earned.
    const stored = mergeInventory(null, observeCapabilities('enr-1', t(
      'CLAUDE.md', '.claude/skills/a/SKILL.md', '.claude/skills/b/SKILL.md', '.claude/skills/c/SKILL.md',
    )));
    const afterBadRead = mergeInventory(stored, { enrollmentId: 'enr-1', entries: [] });
    expect(entry(afterBadRead, 'SKILLS')).toMatchObject({ present: true, count: 3 });
  });

  it('reports capstone progress from what the repo actually holds', () => {
    const inv = mergeInventory(null, observeCapabilities('enr-1', t(
      'CLAUDE.md',
      '.claude/skills/a/SKILL.md', '.claude/skills/b/SKILL.md', '.claude/skills/c/SKILL.md',
      'mcp-server/src/server.py', 'artifacts/week-05/inspector.mp4',
    )));
    expect(capstoneProgress(inv)).toEqual({ complete: 3, total: 10 });
  });
});
