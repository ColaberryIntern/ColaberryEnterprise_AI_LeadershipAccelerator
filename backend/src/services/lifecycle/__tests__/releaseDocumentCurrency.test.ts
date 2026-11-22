/**
 * T13: the three release documents are CURRENT, and the three cited ones are UNMODIFIED.
 *
 * ## Why a test and not a reading
 *
 * The failure this guards against is specific and this project has shipped it before: a closing
 * packet cites a document, the document is real, and the document describes the release before
 * last. Nothing is false in the citation and nothing is true in the evidence. `release-packet-l81.md`
 * was exactly that on 2026-11-21: a draft dated 2026-11-02 asserting "There is no migration in
 * these two PRs" while this branch adds three columns to `projects`.
 *
 * So each cited document has to contain a string that could only exist AFTER this change, and the
 * stale assertion it replaces has to be gone. Both directions, because a one-way test is this
 * repo's recurring defect: asserting only the new string passes against a document that says both
 * things at once, which is worse than saying neither.
 *
 * ## The three cited-unchanged documents are pinned by content hash, not by git
 *
 * `phase4-handoff.md`, `blocked-ticket-rulings-l47-l53-l58.md` and `phase4-isolated-review-l92.md`
 * are cited as already correct, and the criterion is that this change does NOT touch them. A
 * `git diff` against the base would be the obvious check and it does not work here: `ci.yml` never
 * sets `fetch-depth`, so `actions/checkout@v4` clones at depth 1 and there is no base commit in CI
 * to diff against. The hash is checkable anywhere, needs no history, and names the file it caught.
 *
 * Hashes are taken over newline-normalized text. These files are CRLF in this working tree and LF
 * in others, and a line-ending difference is not a modification.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const DOCS = path.resolve(__dirname, '../../../../../docs/project-lifecycle');
const read = (f: string): string =>
  fs.readFileSync(path.join(DOCS, f), 'utf8').replace(/\r\n/g, '\n');
const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

const PACKET = 'release-packet-l81.md';
const GUIDE = 'owner-testing-guide.md';
const MATRIX = 'acceptance-matrix-l04.md';

/** The head this packet was written against. Also asserted to be a real commit, below. */
const PACKET_HEAD_SHA = '990bdc6d6bee6fc47c947118f38240e122ed43b3';

/** The SHAs the stale draft already carried. The declared head must not be one of them. */
const STALE_SHAS = [
  '77af776c0233dfa63c9a25b08540b824f4773c87', // PR #3598
  'e6be7a97e76c596af1521163492263b8a6ed4519', // PR #3595
  'fc70cb41627c13712eac300ca314dc659f0d1c35', // the 2026-11-02 rollback target
];

describe(`${PACKET} is current, and says so in a way that can go stale loudly`, () => {
  it('no longer claims there is no migration', () => {
    // The whole reason this document was stale. Asserted ABSENT, which is the direction a
    // "document updated" claim usually skips.
    expect(read(PACKET)).not.toContain('There is no migration in these two PRs');
  });

  it('names the migration that does exist, and its three columns IN THE COLUMN TABLE', () => {
    const p = read(PACKET);
    expect(p).toContain('ensureConnectedDemoSchema');

    /*
     * Scoped to the table, not the document. `demo_share_enabled` is also named in the prose
     * below it, so a document-wide `toContain` passed while the table row itself had been
     * renamed to a column that does not exist. A mutation found that, and it is the same trap
     * the Morning Five schedule document hit one task earlier.
     */
    const table = /\| column \| type \| default \|\n([\s\S]*?)\n\n/.exec(p);
    expect(table).not.toBeNull();
    for (const col of ['demo_share_token', 'demo_share_enabled', 'demo_spec']) {
      expect(table![1]).toContain(`\`${col}\``);
    }
    // The property that makes "deploy and it applies itself" safe to write down.
    expect(p).toContain('ADD COLUMN IF NOT EXISTS');
  });

  it('declares a reviewed head SHA, and not one of the stale ones', () => {
    const p = read(PACKET);
    const declared = /\*\*Reviewed head SHA:\*\* `([0-9a-f]{40})`/.exec(p);
    expect(declared).not.toBeNull();
    expect(declared![1]).toBe(PACKET_HEAD_SHA);
    for (const stale of STALE_SHAS) {
      expect(declared![1]).not.toBe(stale);
    }
  });

  it('the declared head SHA resolves to a real commit wherever the object is present', () => {
    /*
     * CORRECTED after a verifier measured it. The first version gated on
     * `git rev-parse --is-shallow-repository`, reasoning that `ci.yml` sets no `fetch-depth` so
     * the CI checkout is shallow. The CI half is true. The conclusion was not: THIS WORKTREE IS
     * ALSO SHALLOW (29 grafted tips), so the assertions ran in no environment at all, while the
     * test comment said "locally and in any full clone this runs" and the release packet told
     * its reader a test proved the SHA resolvable. A check that executes nowhere, described as
     * if it executed, is a smaller copy of the exact defect T13 exists to prevent.
     *
     * The gate is now the thing actually being asked: IS THE OBJECT PRESENT. `cat-file -e`
     * answers that in one call, and in this shallow worktree the answer is yes, so the
     * assertions below run here. A clone deep enough to hold the object checks it; one that is
     * not says so out loud rather than passing in silence.
     */
    const git = (args: string[]): { ok: boolean; out: string } => {
      try {
        return { ok: true, out: execFileSync('git', args, { cwd: DOCS, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() };
      } catch {
        return { ok: false, out: '' };
      }
    };

    if (!git(['rev-parse', '--git-dir']).ok) return; // not a git checkout at all

    const present = git(['cat-file', '-e', `${PACKET_HEAD_SHA}^{commit}`]).ok;
    if (!present) {
      /*
       * Not a silent skip. The one fact worth knowing in this case is WHY the object is absent,
       * and the only benign reason is a shallow clone that never fetched it. Anything else means
       * the packet names a SHA this repository has never held.
       */
      expect(git(['rev-parse', '--is-shallow-repository']).out).toBe('true');
      return;
    }

    expect(git(['cat-file', '-t', PACKET_HEAD_SHA]).out).toBe('commit');
    // An ancestor of HEAD, so the packet cannot name a commit from some other branch.
    expect(git(['merge-base', '--is-ancestor', PACKET_HEAD_SHA, 'HEAD']).ok).toBe(true);
  });

  it('still says it cannot close, because L7.6 is still its open input', () => {
    // The amendment must not quietly promote a draft. L7.6's independent review is a separate
    // task in this same run; until it is recorded, the packet's status is unchanged.
    const p = read(PACKET);
    expect(p).toContain('it still cannot close');
    expect(p).toContain('L7.6');
  });
});

describe(`${GUIDE} covers the demo, which it did not mention at all`, () => {
  it('has five numbered live checks', () => {
    const g = read(GUIDE);
    for (let i = 1; i <= 5; i += 1) {
      expect(g).toContain(`### Check ${i}.`);
    }
    // And not a sixth, which would mean the document and this test disagree about "five".
    expect(g).not.toContain('### Check 6.');
  });

  /** One numbered check's own text, so an assertion cannot be satisfied by a different check. */
  const checkBody = (n: number): string => {
    const g = read(GUIDE);
    const from = g.indexOf(`### Check ${n}.`);
    expect(from).toBeGreaterThan(-1);
    const next = g.indexOf('### Check ', from + 1);
    const end = next === -1 ? g.indexOf('\n## ', from) : next;
    return g.slice(from, end === -1 ? undefined : end);
  };

  it('names the demo\'s OWN switch in both checks that turn on it', () => {
    /*
     * Per check, not per document. `demo_share_enabled` appears in check 2 and in check 5, so a
     * document-wide `toContain` passed while check 2 had been rewritten to point at
     * `share_enabled`, the PORTFOLIO switch. That is the exact confusion the two columns were
     * separated to prevent, and the mutation that found it is M10.
     */
    expect(checkBody(2)).toContain('demo_share_enabled');
    expect(checkBody(5)).toContain('demo_share_enabled');
    // Check 5 is the one that must name both, because its whole point is that they differ.
    expect(checkBody(5)).toContain('`share_enabled`');
  });

  it('names both halves of the indexing refusal', () => {
    // The meta tag is for the page; the header is for anything that fetches it without parsing
    // HTML. Scoped to check 4, which is the check that exists to find them.
    const c4 = checkBody(4);
    expect(c4).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(c4).toContain('X-Robots-Tag: noindex, nofollow');
  });

  it('quotes the simulated banner in the words the page actually uses', () => {
    /*
     * A testing guide that paraphrases the label it tells you to look for is a guide that cannot
     * detect the label changing. Pinned to the shipped constant, not to a copy of it.
     */
    const engine = fs.readFileSync(
      path.resolve(__dirname, '../../sbp/demoKitAssets/index.html'),
      'utf8',
    );
    expect(engine).toContain("var SIMULATED = 'Simulated, not live'");
    expect(read(GUIDE)).toContain('Simulated, not live. Nothing here was produced by the real system.');
  });

  it('carries a limitations section, and the one limitation it would be easiest to omit', () => {
    const g = read(GUIDE);
    expect(g).toContain('## What the Connected Demo does NOT do');
    /*
     * The honest one: a republished spec overwrites in place, with no content hash, where a
     * blueprint in `operating_blueprint_manifests` carries `refs_sha256` and a revision for
     * exactly that purpose. So a reviewer cannot later prove which demo they approved.
     */
    expect(g).toContain('operating_blueprint_manifests');
    expect(g).toContain('refs_sha256');
  });

  it('the overwrite it warns about is what the store actually does', () => {
    // The limitation checked against the code, so it cannot outlive the behavior it describes.
    const store = fs.readFileSync(
      path.resolve(__dirname, '../../sbp/connectedDemoStore.ts'),
      'utf8',
    );
    expect(store).toContain('SET demo_spec = CAST(:spec AS JSONB)');
  });
});

describe(`${MATRIX} shows a decision for LC-10 and LC-11, not a gap`, () => {
  it('cites the L9.7 record BY FILENAME, which is the one-hop requirement', () => {
    const m = read(MATRIX);
    expect(m).toContain('decision-l97-lc10-lc11-rescoped.md');
    // And the file it names exists, which is the half a citation usually leaves unchecked.
    expect(fs.existsSync(path.join(DOCS, 'decision-l97-lc10-lc11-rescoped.md'))).toBe(true);
  });

  it('cites PR #3613, which it did not before', () => {
    // Document-wide is the weak half of this claim, kept because the narrative below the table
    // cites it too. The per-row half is in the next test, and it is the one that matters: a
    // document-wide `toContain` passes while one of the two rows has lost the citation.
    expect(read(MATRIX)).toContain('PR #3613');
  });

  it('both rows read RE-SCOPED, and neither reads done or satisfied', () => {
    const m = read(MATRIX);
    const rowOf = (id: string): string => {
      const line = m.split('\n').find((l) => l.startsWith(`| **${id}**`));
      expect(line).toBeDefined();
      return line as string;
    };
    for (const id of ['LC-10', 'LC-11']) {
      const row = rowOf(id);
      expect(row).toContain('RE-SCOPED');
      expect(row).toContain('WITHDRAWN');
      expect(row).toContain('decision-l97-lc10-lc11-rescoped.md');
      // Per ROW, not per document. Both of these must reach somebody who reads one line of the
      // table and stops, which is how this table is actually read.
      expect(row).toContain('PR #3613');
      /*
       * The inverse, which is the claim that would be false. `**Met` is this document's own
       * marker for a satisfied row, so it is the exact string a mistaken edit would reach for.
       * An earlier version of this assertion banned the word "satisfied" outright and failed on
       * the row's own phrase "not satisfied", which is the opposite claim.
       */
      expect(row).not.toContain('**Met');
    }
  });

  it('and `**Met` is really how this document marks a satisfied row', () => {
    // The control for the assertion above. A needle the document never uses would make that
    // check pass against anything, including a row that reads "done".
    const lc08 = read(MATRIX).split('\n').find((l) => l.startsWith('| **LC-08**'));
    expect(lc08).toBeDefined();
    expect(lc08 as string).toContain('**Met');
  });

  it('records that its L9.7 input is now satisfied while Phase 8 still is not', () => {
    const m = read(MATRIX);
    expect(m).toContain('that input is now satisfied');
    expect(m).toContain('What remains is Phase 8');
  });
});

describe('the three documents cited as already correct are NOT modified by this change', () => {
  /*
   * Pinned on 2026-11-22 from the state these files have on `origin/main`. If a later change
   * genuinely needs to edit one, the right move is to update the hash in the same commit, which
   * makes the edit visible in review instead of silent.
   */
  const PINNED: ReadonlyArray<readonly [string, string]> = [
    ['phase4-handoff.md', '04d345298b2802077b267973f6e1b6524f1f59b48ea1f6d40c4de4fe03b18acc'],
    [
      'blocked-ticket-rulings-l47-l53-l58.md',
      'ecf6e56866ebe2ee35456fa67a28ed0f5663cfc9c6250adeab8f5b791a69eabe',
    ],
    ['phase4-isolated-review-l92.md', '183bd5bb597449a13eeb95f49f17744e4cf610ca0e9e828de766855a18c1f318'],
  ];

  it.each(PINNED)('%s is byte-for-byte what it was', (file, hash) => {
    expect(sha256(read(file))).toBe(hash);
  });

  it('the hashes are of the real files, not of three empty reads', () => {
    // The control. Three `readFileSync` calls that all returned '' would hash equal to each
    // other and this suite would pass on nothing.
    const hashes = new Set(PINNED.map(([f]) => sha256(read(f))));
    expect(hashes.size).toBe(3);
    for (const [f] of PINNED) {
      expect(read(f).length).toBeGreaterThan(5000);
    }
  });
});
