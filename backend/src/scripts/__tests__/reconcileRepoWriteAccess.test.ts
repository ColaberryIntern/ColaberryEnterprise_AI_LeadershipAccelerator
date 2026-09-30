/**
 * reconcileRepoWriteAccess — the reporting rule.
 *
 * `summarise` is what an operator reads before deciding to run `--apply`, so the
 * distinctions it draws are the ones that matter: a repo we could not READ is
 * never counted as one we cannot WRITE to, and an answer that CHANGED is called
 * out rather than folded into a total.
 */
import { summarise } from '../reconcileRepoWriteAccess';

type Row = Parameters<typeof summarise>[0][number];

const row = (over: Partial<Row> = {}): Row => ({
  projectId: 'p1', owner: 'acme', repo: 'thing', was: 'unrecorded', now: false, ...over,
} as Row);

describe('summarise', () => {
  it('counts newly resolved connections and splits them by answer', () => {
    const out = summarise([
      row({ was: 'unrecorded', now: true }),
      row({ was: 'unrecorded', now: false }),
      row({ was: 'unrecorded', now: false }),
    ]);
    expect(out).toContain('newly resolved:      3');
    expect(out).toContain('-> can push:       1');
    expect(out).toContain('-> cannot push:    2');
  });

  it('never counts an unreadable repo as one we cannot push to', () => {
    // The distinction the whole script hinges on: "we could not read it" is not
    // evidence about write permission, and recording it as such would assert a
    // fact we never established.
    const out = summarise([row({ now: null, note: 'RepoNotFound' })]);
    expect(out).toContain('unreadable:          1');
    expect(out).toContain('newly resolved:      0');
    expect(out).toContain('platform CAN push:   0');
  });

  it('names each unreadable repo with its reason', () => {
    const out = summarise([row({ owner: 'a', repo: 'gone', now: null, note: 'RepoNotFound' })]);
    expect(out).toContain('SKIP  a/gone  (RepoNotFound)');
  });

  it('calls out an answer that flipped, rather than burying it in a total', () => {
    const out = summarise([row({ owner: 'a', repo: 'b', was: 'false', now: true })]);
    expect(out).toContain('changed answer:      1');
    expect(out).toContain('FLIP  a/b  false -> true');
  });

  it('does not treat an unchanged recorded answer as a flip', () => {
    const out = summarise([row({ was: 'true', now: true }), row({ was: 'false', now: false })]);
    expect(out).toContain('changed answer:      0');
  });

  it('reports zeros cleanly on an empty run', () => {
    const out = summarise([]);
    expect(out).toContain('connections checked: 0');
    expect(out).toContain('unreadable:          0');
  });

  it('counts push-capable connections regardless of what was recorded before', () => {
    const out = summarise([
      row({ was: 'true', now: true }),
      row({ was: 'unrecorded', now: true }),
      row({ was: 'false', now: false }),
    ]);
    expect(out).toContain('platform CAN push:   2');
  });
});
