/**
 * The batch runner's abort paths.
 *
 * Every test here answers one question: does the runner STOP, or does it carry
 * on and mail the next person? Twenty-five real students are on the other end
 * of this script, so "logged a warning and continued" is the defect, not the
 * mitigation.
 *
 * `computeIdempotencyKey` is imported rather than reimplemented, so a change to
 * the key formula breaks this suite instead of silently letting the runner and
 * the drafts on disk drift apart. config/database is mocked only so that import
 * does not open a connection.
 */
jest.mock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

import { computeIdempotencyKey } from '../../../services/email/idempotentSend';
import {
  isDenylisted,
  preflight,
  renderBody,
  runBatch,
  type BatchDeps,
  type BatchOptions,
  type ManifestEntry,
  type ParsedDraft,
} from '../studentUnblockBatch';

const EVENT = 'story000-unblock-2026-08-17';

function makePerson(email: string, subject: string) {
  return { email, subject, key: computeIdempotencyKey(email, subject, EVENT) };
}

const PEOPLE = [
  makePerson('millionabate19@gmail.com', 'Your account problem, found and fixed'),
  makePerson('bitania3@gmail.com', 'Your Daily Priority Assistant, and a fresh sign in link'),
  makePerson('qninying@gmail.com', 'Your three questions, answered'),
  makePerson('bfglz@yahoo.com', 'Your build, and a fresh sign in link'),
];

const MANIFEST: ManifestEntry[] = PEOPLE.map((p, i) => ({
  file: `person${i}.md`,
  email: p.email,
  name: `Person ${i}`,
  group: 'A',
  subject: p.subject,
  key: p.key,
}));

const DRAFTS: Record<string, ParsedDraft> = Object.fromEntries(
  MANIFEST.map((m) => [m.file, {
    to: m.email,
    subject: m.subject,
    businessEventId: EVENT,
    idempotencyKey: m.key,
    status: 'DRAFT_HELD_DO_NOT_SEND',
    body: `Hello,\n\nGo to https://enterprise.colaberry.ai/portal/login\n\nAli\n`,
  } as ParsedDraft]),
);

function makeDeps(over: Partial<BatchDeps> = {}) {
  const sendOnce = jest.fn(async (id: any) => ({
    outcome: 'sent' as const, idempotencyKey: id.idempotencyKey, messageId: `mid-${id.recipient}`,
  }));
  const runGate = jest.fn(async () => ({ ok: true, exitCode: 0, summary: '25 passed, 0 failed.' }));
  const deps: BatchDeps = {
    loadDraft: (file) => {
      const d = DRAFTS[file];
      if (!d) throw new Error(`no such draft ${file}`);
      return d;
    },
    runGate,
    sendOnce: sendOnce as any,
    computeKey: computeIdempotencyKey,
    log: () => {},
    ...over,
  };
  return { deps, sendOnce: deps.sendOnce as jest.Mock, runGate: deps.runGate as jest.Mock };
}

function makeOptions(over: Partial<BatchOptions> = {}): BatchOptions {
  return {
    manifest: MANIFEST,
    businessEventId: EVENT,
    dryRun: false,
    batchSize: 2,
    canaryOnly: true,
    canaryConfirmed: true,
    ...over,
  };
}

describe('preflight', () => {
  it('happy path: a consistent manifest and draft set returns null', () => {
    const { deps } = makeDeps();

    expect(preflight(makeOptions(), deps)).toBeNull();
  });

  it('aborts when the key on the draft no longer describes the draft (subject edited after drafting)', () => {
    const { deps } = makeDeps({
      loadDraft: (file) => ({ ...DRAFTS[file], subject: DRAFTS[file].subject }),
    });
    // Manifest and draft agree with each other, and both disagree with reality:
    // the declared key was computed against an older subject line.
    const stale = MANIFEST.map((m, i) =>
      i === 1 ? { ...m, key: computeIdempotencyKey(m.email, 'An older subject', EVENT) } : m);
    const drafts: Record<string, ParsedDraft> = {
      ...DRAFTS,
      'person1.md': { ...DRAFTS['person1.md'], idempotencyKey: stale[1].key },
    };

    const result = preflight(makeOptions({ manifest: stale }), {
      loadDraft: (f) => drafts[f],
      computeKey: computeIdempotencyKey,
    });

    expect(result).toEqual({
      reason: 'derived_key_mismatch',
      detail: `person1.md: recomputed ${PEOPLE[1].key} from the live draft, manifest carries ${stale[1].key}`,
    });
  });

  it('aborts when the draft addresses someone other than the manifest row', () => {
    const drafts = { ...DRAFTS, 'person2.md': { ...DRAFTS['person2.md'], to: 'someoneelse@gmail.com' } };

    const result = preflight(makeOptions(), {
      loadDraft: (f) => drafts[f], computeKey: computeIdempotencyKey,
    });

    expect(result?.reason).toBe('recipient_mismatch');
  });

  it('aborts on a denylisted recipient even though the manifest lists them', () => {
    const poisoned = [...MANIFEST, {
      file: 'ikenna.md', email: 'nzeribeikenna@gmail.com', name: 'Ikenna Nzeribe',
      group: 'D', subject: 'You are in, here is where to start',
      key: computeIdempotencyKey('nzeribeikenna@gmail.com', 'You are in, here is where to start', EVENT),
    }];
    const { deps } = makeDeps();

    const result = preflight(makeOptions({ manifest: poisoned }), deps);

    expect(result).toEqual({
      reason: 'denylisted_recipient',
      detail: 'ikenna.md targets nzeribeikenna@gmail.com',
    });
  });

  it('aborts when two manifest rows carry the same key', () => {
    const dup = [MANIFEST[0], { ...MANIFEST[1], key: MANIFEST[0].key }];
    const { deps } = makeDeps();

    const result = preflight(makeOptions({ manifest: dup }), deps);

    expect(result?.reason).toBe('duplicate_key_in_manifest');
  });
});

describe('the denylist', () => {
  it.each([
    ['nzeribeikenna@gmail.com', true],
    ['rogation2000@yahoo.fr', true],
    ['ali@colaberry.com', true],
    ['ali+demo-run1@colaberry.com', true],
    ['ALI+7@colaberry.com', true],
    // The keeper of the Marione pair, and the two staff addresses that ARE on
    // the send list. A denylist that eats these sends nobody anything.
    ['rogation2000.mn@gmail.com', false],
    ['farhat@colaberry.com', false],
    ['taiwo@colaberry.com', false],
  ])('%s -> %s', (email, expected) => {
    expect(isDenylisted(email as string)).toBe(expected);
  });
});

describe('runBatch — the gate', () => {
  it('ABORTS on a gate failure before the first send, and the provider is never called', async () => {
    const { deps, sendOnce } = makeDeps({
      runGate: jest.fn(async () => ({ ok: false, exitCode: 1, summary: '24 passed, 1 failed.' })),
    });

    const outcome = await runBatch(makeOptions(), deps);

    expect(outcome.status).toBe('aborted');
    expect(outcome.abort).toEqual({
      reason: 'gate_failed',
      detail: 'exit 1 at pre_send: 24 passed, 1 failed.',
    });
    expect(sendOnce).not.toHaveBeenCalled();
  });

  it('ABORTS between batches on a gate failure, keeping only what already went out', async () => {
    let call = 0;
    const { deps, sendOnce } = makeDeps({
      runGate: jest.fn(async () => {
        call += 1;
        return call === 1
          ? { ok: true, exitCode: 0, summary: 'ok' }
          : { ok: false, exitCode: 2, summary: 'GATE SELFTEST FAILED' };
      }),
    });

    const outcome = await runBatch(makeOptions({ batchSize: 2 }), deps);

    expect(outcome.status).toBe('aborted');
    expect(outcome.abort?.reason).toBe('gate_failed');
    // Two went out in the first batch; the remaining two did not.
    expect(sendOnce).toHaveBeenCalledTimes(2);
    expect(outcome.sent.map((s) => s.file)).toEqual(['person0.md', 'person1.md']);
  });

  it('re-runs the gate between every batch, not once at the start', async () => {
    const { deps, runGate } = makeDeps();

    await runBatch(makeOptions({ batchSize: 1 }), deps);

    // 1 pre-send + 3 between-batch runs for 4 recipients at batch size 1.
    expect(runGate).toHaveBeenCalledTimes(4);
  });
});

describe('runBatch — dry run and canary', () => {
  it('dry run is the safe default shape: gate runs, nothing is claimed or sent', async () => {
    const { deps, sendOnce, runGate } = makeDeps();

    const outcome = await runBatch(makeOptions({ dryRun: true }), deps);

    expect(outcome.status).toBe('dry_run_ok');
    expect(sendOnce).not.toHaveBeenCalled();
    expect(runGate).toHaveBeenCalledTimes(1);
    expect(outcome.sent).toEqual([]);
  });

  it('an unconfirmed canary sends exactly ONE message and then stops', async () => {
    const { deps, sendOnce } = makeDeps();

    const outcome = await runBatch(makeOptions({ canaryConfirmed: false, batchSize: 5 }), deps);

    expect(outcome.status).toBe('canary_sent');
    expect(sendOnce).toHaveBeenCalledTimes(1);
    expect(outcome.sent).toEqual([{
      file: 'person0.md',
      recipient: 'millionabate19@gmail.com',
      idempotencyKey: PEOPLE[0].key,
      messageId: 'mid-millionabate19@gmail.com',
    }]);
  });

  it('a confirmed canary run proceeds through everyone and reports complete', async () => {
    const { deps, sendOnce } = makeDeps();

    const outcome = await runBatch(makeOptions({ canaryConfirmed: true }), deps);

    expect(outcome.status).toBe('complete');
    expect(sendOnce).toHaveBeenCalledTimes(4);
    expect(outcome.sent).toHaveLength(4);
  });
});

describe('runBatch — send anomalies', () => {
  it('ABORTS on a provider failure rather than moving to the next recipient', async () => {
    const { deps, sendOnce } = makeDeps({
      sendOnce: jest.fn(async (id: any) =>
        id.recipient === 'bitania3@gmail.com'
          ? { outcome: 'failed', idempotencyKey: id.idempotencyKey, errorClass: 'TimeoutError', error: 'socket hang up' }
          : { outcome: 'sent', idempotencyKey: id.idempotencyKey, messageId: 'mid-1' }) as any,
    });

    const outcome = await runBatch(makeOptions(), deps);

    expect(outcome.status).toBe('aborted');
    expect(outcome.abort).toEqual({
      reason: 'send_failed',
      detail: 'person1.md: TimeoutError: socket hang up',
    });
    // Person 2 and 3 are untouched: two calls made, not four.
    expect(sendOnce).toHaveBeenCalledTimes(2);
  });

  it('ABORTS when a claim is refused as in_flight — something else is sending this', async () => {
    const { deps } = makeDeps({
      sendOnce: jest.fn(async (id: any) =>
        ({ outcome: 'skipped', reason: 'in_flight', idempotencyKey: id.idempotencyKey })) as any,
    });

    const outcome = await runBatch(makeOptions(), deps);

    expect(outcome.status).toBe('aborted');
    expect(outcome.abort?.reason).toBe('claim_in_flight');
  });

  it('ABORTS when a claim is refused on the natural key — the hash disagrees with the message', async () => {
    const { deps } = makeDeps({
      sendOnce: jest.fn(async (id: any) =>
        ({ outcome: 'skipped', reason: 'duplicate_natural_key', idempotencyKey: id.idempotencyKey })) as any,
    });

    const outcome = await runBatch(makeOptions(), deps);

    expect(outcome.abort?.reason).toBe('claim_natural_key_conflict');
  });

  it('already_sent is the ONE benign skip: a resumed run steps over the canary and continues', async () => {
    const { deps, sendOnce } = makeDeps({
      sendOnce: jest.fn(async (id: any) =>
        id.recipient === 'millionabate19@gmail.com'
          ? { outcome: 'skipped', reason: 'already_sent', idempotencyKey: id.idempotencyKey }
          : { outcome: 'sent', idempotencyKey: id.idempotencyKey, messageId: 'mid-2' }) as any,
    });

    const outcome = await runBatch(makeOptions(), deps);

    expect(outcome.status).toBe('complete');
    expect(sendOnce).toHaveBeenCalledTimes(4);
    expect(outcome.skipped).toEqual([{
      file: 'person0.md',
      recipient: 'millionabate19@gmail.com',
      idempotencyKey: PEOPLE[0].key,
      reason: 'already_sent',
    }]);
    expect(outcome.sent).toHaveLength(3);
  });

  it('the HALT file stops the run at the next recipient, mid-batch', async () => {
    let halted = false;
    const { deps, sendOnce } = makeDeps({
      haltRequested: () => (halted ? 'HALT file present in run dir' : null),
      sendOnce: jest.fn(async (id: any) => {
        halted = true; // a human touches HALT while the first message is going out
        return { outcome: 'sent', idempotencyKey: id.idempotencyKey, messageId: 'mid-h' };
      }) as any,
    });

    const outcome = await runBatch(makeOptions({ batchSize: 5 }), deps);

    expect(outcome.status).toBe('aborted');
    expect(outcome.abort).toEqual({
      reason: 'halt_requested', detail: 'HALT file present in run dir',
    });
    expect(sendOnce).toHaveBeenCalledTimes(1);
  });

  it('every completed send is logged with recipient, key and the provider message id', async () => {
    const logged: Array<{ event: string; context: Record<string, unknown> }> = [];
    const { deps } = makeDeps({ log: (event, context) => logged.push({ event, context }) });

    await runBatch(makeOptions({ canaryConfirmed: false }), deps);

    const sendLogs = logged.filter((l) => l.event === 'send_ok');
    expect(sendLogs).toHaveLength(1);
    expect(sendLogs[0].context).toEqual({
      file: 'person0.md',
      recipient: 'millionabate19@gmail.com',
      idempotency_key: PEOPLE[0].key,
      provider_message_id: 'mid-millionabate19@gmail.com',
    });
  });
});

describe('renderBody', () => {
  it('adds no content of its own — the HTML is the gated text and nothing else', () => {
    const { text, html } = renderBody('Line one.\nStill one.\n\nParagraph two.\n');

    expect(text).toBe('Line one.\nStill one.\n\nParagraph two.');
    expect(html).toBe(
      '<p style="margin:0 0 16px 0;">Line one.<br>Still one.</p>\n' +
      '<p style="margin:0 0 16px 0;">Paragraph two.</p>',
    );
  });

  it('escapes angle brackets so a student quoting <tag> cannot break the message', () => {
    expect(renderBody('use <script> carefully').html).toBe(
      '<p style="margin:0 0 16px 0;">use &lt;script&gt; carefully</p>',
    );
  });
});
