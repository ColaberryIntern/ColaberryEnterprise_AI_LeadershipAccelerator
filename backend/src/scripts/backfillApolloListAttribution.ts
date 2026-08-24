/**
 * backfillApolloListAttribution — repair the list attribution on Apollo leads
 * that were imported before the mapper knew about `label_ids`.
 *
 * The first production import (2026-08-24) landed 337 leads with an empty
 * `utm_campaign`, because /v1/contacts/search returns list IDs rather than list
 * names and the mapper only looked for names. The rows are otherwise correct,
 * and each one stored its `apollo_id`, so this repairs them in place instead of
 * re-importing anything.
 *
 * Walks each Apollo list, reads the contacts on it, and stamps the list name
 * onto the matching leads. A lead on several lists keeps the first list that
 * claims it in `utm_campaign` and gets all of them in `notes`, matching what a
 * fresh import would now produce.
 *
 * Cannot spend Apollo credits: it goes through apolloAccountClient, whose
 * allowlist covers only account-scoped reads over contacts we already own.
 *
 * Dry run by default. Idempotent: re-running rewrites the same values, and rows
 * that already carry attribution are left alone unless --force is given.
 *
 *   node dist/scripts/backfillApolloListAttribution.js
 *   node dist/scripts/backfillApolloListAttribution.js --commit
 *   node dist/scripts/backfillApolloListAttribution.js --commit --force
 */
import { QueryTypes } from 'sequelize';
import { sequelize } from '../config/database';
import { apolloAccountFetch } from '../services/leads/apolloAccountClient';
import { listApolloLists } from '../services/leads/apolloContactImportService';

const PAGE_SIZE = 100;
const MAX_PAGES_PER_LIST = 40;

interface Row {
  id: number;
  apollo_id: string;
  utm_campaign: string | null;
}

(async () => {
  const commit = process.argv.includes('--commit');
  const force = process.argv.includes('--force');
  console.log(`mode: ${commit ? 'COMMIT' : 'DRY RUN'}${force ? ' + FORCE' : ''}`);

  // Every imported Apollo lead that still has an apollo_id to match on.
  const leads = await sequelize.query<Row>(
    `SELECT id, apollo_id, utm_campaign
       FROM leads
      WHERE source = 'apollo_contacts' AND apollo_id IS NOT NULL`,
    { type: QueryTypes.SELECT }
  );
  const byApolloId = new Map(leads.map((l) => [l.apollo_id, l]));
  console.log(`${leads.length} imported Apollo leads, ` +
    `${leads.filter((l) => !l.utm_campaign).length} missing attribution\n`);

  const lists = await listApolloLists();
  // Lists a lead belongs to, in the order Apollo reported them.
  const namesByLead = new Map<number, string[]>();

  for (const list of lists) {
    if (!list.count) continue;
    let page = 1;
    let matched = 0;

    while (page <= MAX_PAGES_PER_LIST) {
      const data = await apolloAccountFetch('/v1/contacts/search', {
        page,
        per_page: PAGE_SIZE,
        contact_label_ids: [list.id],
      });
      const contacts: Array<{ id?: string }> = data?.contacts ?? [];
      if (!contacts.length) break;

      for (const c of contacts) {
        if (!c.id) continue;
        const lead = byApolloId.get(c.id);
        if (!lead) continue;
        const names = namesByLead.get(lead.id) ?? [];
        if (!names.includes(list.name)) names.push(list.name);
        namesByLead.set(lead.id, names);
        matched++;
      }

      const totalPages = data?.pagination?.total_pages ?? page;
      if (page >= totalPages) break;
      page++;
    }
    console.log(`  ${String(matched).padStart(4)} matched  ${list.name}`);
  }

  const targets = [...namesByLead.entries()].filter(([leadId]) => {
    const lead = leads.find((l) => l.id === leadId);
    return force || !lead?.utm_campaign;
  });

  console.log(`\n${targets.length} leads would be stamped.`);

  if (!commit) {
    console.log('DRY RUN: nothing written. Re-run with --commit.');
    await sequelize.close();
    return;
  }

  let updated = 0;
  const importedOn = new Date().toISOString().slice(0, 10);
  for (const [leadId, names] of targets) {
    await sequelize.query(
      `UPDATE leads
          SET utm_campaign = :primary,
              notes = :notes,
              updated_at = NOW()
        WHERE id = :id`,
      {
        replacements: {
          id: leadId,
          primary: names[0],
          notes: `Imported from Apollo on ${importedOn}. Apollo lists: ${names.join(', ')}.`,
        },
      }
    );
    updated++;
  }

  console.log(`stamped ${updated} leads.`);
  await sequelize.close();
})().catch((e) => {
  console.error('FAIL:', e?.message ?? e);
  if (e?.errorClass) console.error('error_class:', e.errorClass);
  process.exit(1);
});
