/**
 * seedLeadNotificationRule — make somebody get told when a lead arrives.
 *
 * The routing engine has run on every ingested lead for as long as it has existed, and
 * `select count(*) from routing_rules` on production returns **0**. It has never had
 * anything to match. This writes the first rule.
 *
 * The handler it fires (`notify_sales`) was a stub returning `ok: true` until 2026-09-03;
 * seeding a rule before that fix would have produced a system that reported notifying
 * someone and sent nothing. Order matters: the handler first, then this.
 *
 * ## Dry by default
 *
 * Like `convertLeadToClient`, this is meant to run against production, so the protection
 * is a preview rather than a refusal. Without `--commit` it prints the exact rule it
 * would write and stops.
 *
 * ## Safe to run twice
 *
 * The rule is matched by name and updated rather than duplicated. Two identical rules
 * would mean two alerts per lead, which is the fastest way to teach someone to ignore
 * the alert.
 *
 * Usage:
 *   node dist/scripts/seedLeadNotificationRule.js --source ai-flotation --to ali@colaberry.com
 *   node dist/scripts/seedLeadNotificationRule.js --source ai-flotation --to ali@colaberry.com --commit
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { RoutingRule } from '../models';

export interface RuleArgs {
  sourceSlug: string;
  to: string;
  name: string;
  convertUrl?: string;
  commit: boolean;
  /** Which action the rule fires. `notify_sales` emails a human; `request_callback` dials. */
  action: 'notify_sales' | 'request_callback';
  /** Narrows the rule to one form. Omitted means every lead from the source. */
  entrySlug?: string;
}

export function parseRuleArgs(argv: string[]): RuleArgs {
  const value = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const sourceSlug = (value('--source') || '').trim();
  const action = (value('--action') || 'notify_sales').trim() as RuleArgs['action'];
  const entrySlug = (value('--entry') || '').trim() || undefined;
  const to = (value('--to') || '').trim();

  if (!sourceSlug) throw new Error('--source <slug> is required (matches lead source_slug)');
  if (action !== 'notify_sales' && action !== 'request_callback') {
    throw new Error(`--action must be notify_sales or request_callback, got '${action}'`);
  }
  // Only the notification needs a recipient. A callback rings the number on the lead, so
  // demanding an address for it would be asking for something the action never uses.
  // Required rather than defaulted to the admin list: a rule that silently notifies
  // whoever the global setting happens to name is a rule nobody can reason about.
  if (action === 'notify_sales' && !to) throw new Error('--to <email> is required (who should be told)');

  const defaultName = action === 'request_callback'
    ? `Call back on ${sourceSlug} ${entrySlug || 'lead'}`
    : `Notify on ${sourceSlug} lead`;

  return {
    sourceSlug,
    to,
    action,
    entrySlug,
    name: (value('--name') || defaultName).trim(),
    convertUrl: value('--convert-url'),
    commit: argv.includes('--commit'),
  };
}

/** The rule body. Pure, so the shape is testable without a database. */
export function buildRule(args: RuleArgs): {
  name: string; priority: number; conditions: Record<string, any>;
  actions: Array<Record<string, any>>; continue_on_match: boolean; is_active: boolean;
} {
  return {
    name: args.name,
    // Leaves room above and below for rules that must run first or last.
    priority: 100,
    // A bare key is equality in this engine; both are top-level facts.
    conditions: {
      source_slug: args.sourceSlug,
      ...(args.entrySlug ? { entry_slug: args.entrySlug } : {}),
    },
    actions: [args.action === 'request_callback'
      ? { type: 'request_callback' }
      : {
        type: 'notify_sales',
        channel: 'email',
        to: args.to,
        ...(args.convertUrl ? { convert_url: args.convertUrl } : {}),
      }],
    // Other rules for this source should still get their turn.
    continue_on_match: true,
    is_active: true,
  };
}

async function main(): Promise<void> {
  const args = parseRuleArgs(process.argv.slice(2));

  const [db] = await sequelize.query<{ name: string }>(
    'SELECT current_database() AS name', { type: QueryTypes.SELECT },
  );
  console.log(`[rule] database: ${db.name}`);

  const rule = buildRule(args);
  const existing = await RoutingRule.findOne({ where: { name: rule.name } });

  console.log(`[rule] ${existing ? 'UPDATE existing' : 'CREATE new'}: ${rule.name}`);
  console.log(`  when   : source_slug = ${args.sourceSlug}${args.entrySlug ? ` AND entry_slug = ${args.entrySlug}` : ''}`);
  console.log(`  then   : ${args.action === 'request_callback' ? 'request_callback (dial the number on the lead)' : `notify_sales by email to ${args.to}`}`);
  if (args.convertUrl) console.log(`  convert: ${args.convertUrl}`);

  const total = await RoutingRule.count();
  console.log(`[rule] routing_rules currently holds ${total} rule(s)`);

  if (!args.commit) {
    console.log('\n[rule] DRY RUN — nothing was written. Re-run with --commit to apply.');
    return;
  }

  if (existing) {
    await existing.update(rule as any);
    console.log(`\n[rule] UPDATED ${(existing as any).id}`);
  } else {
    const created = await RoutingRule.create(rule as any);
    console.log(`\n[rule] CREATED ${(created as any).id}`);
  }
  console.log(args.action === 'request_callback'
    ? `A ${args.sourceSlug}${args.entrySlug ? ` ${args.entrySlug}` : ''} lead will now be called back on the number it carries. Repeat requests inside five minutes collapse to one call.`
    : `A ${args.sourceSlug} lead will now email ${args.to}. One alert per lead, deduped on the audit log.`);
}

// Guarded so a test can import the pure helpers without connecting to a database.
if (require.main === module) {
  main()
    .then(() => sequelize.close())
    .catch(async (error) => {
      console.error(`[rule] failed: ${(error as Error).message}`);
      process.exitCode = 1;
      await sequelize.close();
    });
}
