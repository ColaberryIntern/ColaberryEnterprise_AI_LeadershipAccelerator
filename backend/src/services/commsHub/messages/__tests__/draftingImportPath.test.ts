import fs from 'fs';
import path from 'path';

/**
 * CH6.3: the drafting module has NO import path to delivery.
 *
 * What this proves, precisely (two layers):
 * 1. TRANSITIVELY, by any chain of imports however long, drafting.ts cannot reach the Communications
 *    Hub's own delivery code: services/commsHub/{delivery,connectors,worker}* (CH7 builds them there).
 *    This holds through shared infrastructure too, so a future model or service that imports the
 *    hub's sender would fail this test.
 * 2. DIRECTLY, no hub-owned file that drafting reaches (anything under services/commsHub/) imports a
 *    member-messaging service: community posts, notifications, email, WhatsApp.
 *
 * Why layer 2 is about direct imports: drafting must call the platform's LLM wrapper, and that wrapper
 * reaches the whole application through shared infrastructure (llmCallWrapper -> aiEventService ->
 * alertService -> alertDeliveryService, which emails admins when AI calls fail, and the models barrel).
 * Those are the platform's admin alerts, not a way for a draft to be sent to members; the chain is
 * printed in the CH6.3 session log entry.
 */
const SRC = path.resolve(__dirname, '../../../..');
const START = path.resolve(__dirname, '../drafting.ts');
const IMPORT = /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;

function resolveImport(from: string, spec: string): string | null {
  if (!spec.startsWith('.')) return null;
  const base = path.resolve(path.dirname(from), spec);
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts'), base]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function importsOf(file: string): string[] {
  return [...fs.readFileSync(file, 'utf8').matchAll(IMPORT)]
    .map((m) => resolveImport(file, m[1] ?? m[2] ?? m[3]))
    .filter((r): r is string => !!r && r.startsWith(SRC));
}

function reach(start: string): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...importsOf(file));
  }
  return seen;
}

const rel = (f: string): string => path.relative(SRC, f).split(path.sep).join('/');
const HUB_SENDER = /^services\/commsHub\/(delivery|connectors|worker)/i;
const MEMBER_MESSAGING = /^services\/(community\/|communityService|communityNotificationService|emailService|.*whatsapp|communityRooms\/dm)/i;

describe('CH6.3 drafting cannot send', () => {
  const reached = [...reach(START)];

  it('walks a real graph (sanity: it reaches its own helpers, the draft model and the approvals it reconciles)', () => {
    expect(reached.map(rel)).toEqual(expect.arrayContaining([
      'services/commsHub/messages/draftFacts.ts', 'services/commsHub/messages/approvals.ts', 'models/CommsHubDraft.ts',
    ]));
  });

  it('1. no chain of imports reaches the hub\'s delivery, connectors or worker', () => {
    expect(reached.map(rel).filter((f) => HUB_SENDER.test(f))).toEqual([]);
  });

  it('2. no hub file drafting reaches imports a member-messaging service directly', () => {
    const offenders = reached
      .filter((f) => rel(f).startsWith('services/commsHub/'))
      .flatMap((f) => importsOf(f).filter((i) => MEMBER_MESSAGING.test(rel(i)) || HUB_SENDER.test(rel(i))).map((i) => `${rel(f)} -> ${rel(i)}`));
    expect(offenders).toEqual([]);
  });

  it('CONTROL: the patterns would catch a sender (they match the platform\'s real notification and email services)', () => {
    expect(MEMBER_MESSAGING.test('services/communityNotificationService.ts')).toBe(true);
    expect(MEMBER_MESSAGING.test('services/emailService.ts')).toBe(true);
    expect(MEMBER_MESSAGING.test('services/community/replyNotificationService.ts')).toBe(true);
    expect(HUB_SENDER.test('services/commsHub/delivery/worker.ts')).toBe(true);
    expect(HUB_SENDER.test('services/commsHub/connectors/communityPost.ts')).toBe(true);
  });
});
