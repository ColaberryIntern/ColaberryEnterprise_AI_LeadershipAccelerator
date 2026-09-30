/**
 * The pipeline writes CLAUDE.md into every student repo, and students already
 * have a CLAUDE.md with their own conventions in it. The writer replaced the
 * whole file, so a republish silently deleted work they had written — and it
 * compared against our own manifest rather than the file's real contents, so an
 * edit made by hand was not even noticed before being overwritten.
 *
 * Their file is theirs. These tests pin the only three things the splice may
 * ever do.
 */
import {
  spliceManagedBlock, hasManagedBlock, withoutManagedBlock, BLOCK_BEGIN, BLOCK_END,
} from '../managedBlock';

const THEIRS = `# CLAUDE.md

## My conventions
- Always run the linter before committing.
- Never touch the vendor directory.

## My deploy notes
ssh into the box, pull, restart.`;

describe('a student\'s own CLAUDE.md survives', () => {
  it('appends below their content when there is no block yet', () => {
    const out = spliceManagedBlock(THEIRS, 'PIPELINE SECTION');

    expect(out).toContain('Always run the linter before committing.');
    expect(out).toContain('ssh into the box, pull, restart.');
    expect(out).toContain('PIPELINE SECTION');
    // theirs first, ours after — we are the guest in this file
    expect(out.indexOf('My conventions')).toBeLessThan(out.indexOf(BLOCK_BEGIN));
  });

  it('replaces only between the markers on a republish', () => {
    const first = spliceManagedBlock(THEIRS, 'VERSION ONE');
    const second = spliceManagedBlock(first, 'VERSION TWO');

    expect(second).toContain('VERSION TWO');
    expect(second).not.toContain('VERSION ONE');
    expect(withoutManagedBlock(second)).toBe(THEIRS.trim());
  });

  it('keeps edits they made INSIDE their own sections between republishes', () => {
    const first = spliceManagedBlock(THEIRS, 'V1');
    const edited = first.replace('Always run the linter', 'Always run the linter and the type checker');

    const second = spliceManagedBlock(edited, 'V2');

    expect(second).toContain('Always run the linter and the type checker');
    expect(second).toContain('V2');
  });

  it('never leaves two blocks behind, however many times it runs', () => {
    // Distinctive tokens: a bare 'A' also matches "Always" in their own text.
    let out = spliceManagedBlock(THEIRS, 'BLOCK_V1');
    for (const v of ['BLOCK_V2', 'BLOCK_V3', 'BLOCK_V4']) out = spliceManagedBlock(out, v);

    expect(out.match(new RegExp(BLOCK_END, 'g'))).toHaveLength(1);
    expect(out).toContain('BLOCK_V4');
    expect(out).not.toContain('BLOCK_V1');
    expect(withoutManagedBlock(out)).toBe(THEIRS.trim());
  });

  it('writes the block alone when they have no CLAUDE.md at all', () => {
    const out = spliceManagedBlock(null, 'ONLY US');

    expect(out).toContain('ONLY US');
    expect(hasManagedBlock(out)).toBe(true);
  });

  it('treats an empty or whitespace file as no file', () => {
    expect(spliceManagedBlock('   \n\n', 'X')).toBe(spliceManagedBlock(null, 'X'));
  });

  it('is idempotent — same block twice produces the same file', () => {
    const once = spliceManagedBlock(THEIRS, 'SAME');
    expect(spliceManagedBlock(once, 'SAME')).toBe(once);
  });

  it('says plainly, in the file, that the block is overwritten', () => {
    // A student who edits inside the markers should find out from the file,
    // not from losing the edit.
    expect(BLOCK_BEGIN).toMatch(/managed by the build pipeline/i);
    expect(BLOCK_BEGIN).toMatch(/overwritten/i);
  });
});
