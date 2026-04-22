/**
 * importPilotLeads.js
 *
 * Imports leads from Apollo for the 3 AI System Pilot campaigns,
 * then enrolls each imported lead into the campaign's sequence.
 *
 * Usage:
 *   node scripts/importPilotLeads.js
 *
 * Requires:
 *   - DATABASE_URL env var (or .env in project root)
 *   - APOLLO_API_KEY env var
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const { Sequelize, QueryTypes } = require('sequelize');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const APOLLO_API_KEY = process.env.APOLLO_API_KEY;
if (!APOLLO_API_KEY) {
  console.error('APOLLO_API_KEY is not set. Exiting.');
  process.exit(1);
}

const APOLLO_BASE_URL = 'https://api.apollo.io/api/v1';

const sequelize = new Sequelize(DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});

// ─── Campaign Definitions ───────────────────────────────────────────────────

const CAMPAIGNS = [
  {
    name: 'AI System Pilot — Zero Risk',
    apolloParams: {
      person_titles: ['CEO', 'Founder', 'President', 'Owner'],
      q_organization_keyword_tags: ['logistics', 'transportation', 'professional services', 'staffing'],
      organization_num_employees_ranges: ['51,500'],
      person_locations: ['United States'],
      contact_email_status: ['verified'],
      per_page: 100,
    },
  },
  {
    name: 'AI System Pilot — AI Team Replacement',
    apolloParams: {
      person_titles: ['VP Operations', 'COO', 'Director Operations', 'VP Revenue'],
      q_organization_keyword_tags: ['technology', 'financial services', 'healthcare', 'manufacturing'],
      organization_num_employees_ranges: ['201,1000'],
      person_locations: ['United States'],
      contact_email_status: ['verified'],
      per_page: 100,
    },
  },
  {
    name: 'AI System Pilot — Exclusive Build Program',
    apolloParams: {
      person_titles: ['CEO', 'Founder', 'Co-Founder'],
      q_organization_keyword_tags: ['saas', 'software', 'e-commerce', 'fintech', 'health tech'],
      organization_num_employees_ranges: ['51,200'],
      person_locations: ['United States'],
      contact_email_status: ['verified'],
      per_page: 100,
    },
  },
];

// ─── Apollo Search ──────────────────────────────────────────────────────────

async function searchPeople(params) {
  const res = await fetch(`${APOLLO_BASE_URL}/mixed_people/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY,
    },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Apollo search failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    people: data.people || [],
    total: data.pagination?.total_entries || 0,
  };
}

// ─── Import Results ─────────────────────────────────────────────────────────

async function importApolloResults(people, campaignId) {
  let imported = 0;

  for (const person of people) {
    const email = person.email;
    if (!email) continue;

    const name = [person.first_name, person.last_name].filter(Boolean).join(' ') || 'Unknown';
    const company = person.organization?.name || '';
    const title = person.title || '';
    const phone = person.phone_numbers?.[0]?.sanitized_number || person.phone_number || null;
    const linkedinUrl = person.linkedin_url || null;

    try {
      // Check if lead already exists
      const existing = await sequelize.query(
        'SELECT id FROM leads WHERE email = :email LIMIT 1',
        { replacements: { email }, type: QueryTypes.SELECT }
      );

      if (existing.length > 0) {
        console.log(`  [skip] ${email} — already exists (lead ${existing[0].id})`);
        continue;
      }

      // Insert lead
      const [result] = await sequelize.query(
        `INSERT INTO leads (name, email, company, title, phone, linkedin_url, source, status, campaign_id, created_at, updated_at)
         VALUES (:name, :email, :company, :title, :phone, :linkedinUrl, 'apollo_pilot_import', 'new', :campaignId, NOW(), NOW())
         RETURNING id`,
        {
          replacements: { name, email, company, title, phone, linkedinUrl, campaignId },
          type: QueryTypes.INSERT,
        }
      );

      const leadId = result?.[0]?.id || result?.id;
      if (leadId) {
        imported++;
        console.log(`  [imported] ${name} <${email}> — ${company} — lead ${leadId}`);
      }
    } catch (err) {
      console.error(`  [error] ${email}: ${err.message}`);
    }
  }

  return imported;
}

// ─── Enroll in Sequence ─────────────────────────────────────────────────────

async function enrollLeadsInSequence(campaignId, sequenceId) {
  // Find all leads for this campaign that are not yet enrolled
  const leads = await sequelize.query(
    `SELECT l.id FROM leads l
     WHERE l.campaign_id = :campaignId
       AND l.id NOT IN (
         SELECT se.lead_id FROM sequence_enrollments se WHERE se.sequence_id = :sequenceId
       )`,
    { replacements: { campaignId, sequenceId }, type: QueryTypes.SELECT }
  );

  let enrolled = 0;
  for (const lead of leads) {
    try {
      await sequelize.query(
        `INSERT INTO sequence_enrollments (lead_id, sequence_id, campaign_id, current_step, status, created_at, updated_at)
         VALUES (:leadId, :sequenceId, :campaignId, 0, 'active', NOW(), NOW())`,
        { replacements: { leadId: lead.id, sequenceId, campaignId }, type: QueryTypes.INSERT }
      );
      enrolled++;
    } catch (err) {
      console.error(`  [enroll error] lead ${lead.id}: ${err.message}`);
    }
  }

  return enrolled;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== AI System Pilot — Lead Import ===\n');

  try {
    await sequelize.authenticate();
    console.log('Database connected.\n');
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }

  const totals = { searched: 0, imported: 0, enrolled: 0 };

  for (const campaignDef of CAMPAIGNS) {
    console.log(`\n--- ${campaignDef.name} ---`);

    // Look up campaign
    const [campaign] = await sequelize.query(
      'SELECT id, sequence_id FROM campaigns WHERE name = :name LIMIT 1',
      { replacements: { name: campaignDef.name }, type: QueryTypes.SELECT }
    );

    if (!campaign) {
      console.error(`  Campaign not found: "${campaignDef.name}". Run the seed first.`);
      continue;
    }

    const campaignId = campaign.id;
    const sequenceId = campaign.sequence_id;
    console.log(`  Campaign ID: ${campaignId}`);
    console.log(`  Sequence ID: ${sequenceId}`);

    // Search Apollo
    console.log('  Searching Apollo...');
    const { people, total } = await searchPeople(campaignDef.apolloParams);
    console.log(`  Found ${total} total matches, received ${people.length} results.`);
    totals.searched += people.length;

    // Import
    const imported = await importApolloResults(people, campaignId);
    console.log(`  Imported: ${imported}`);
    totals.imported += imported;

    // Enroll in sequence
    if (sequenceId) {
      const enrolled = await enrollLeadsInSequence(campaignId, sequenceId);
      console.log(`  Enrolled in sequence: ${enrolled}`);
      totals.enrolled += enrolled;
    } else {
      console.log('  No sequence_id on campaign — skipping enrollment.');
    }
  }

  console.log('\n=== Summary ===');
  console.log(`  Searched: ${totals.searched} people`);
  console.log(`  Imported: ${totals.imported} leads`);
  console.log(`  Enrolled: ${totals.enrolled} in sequences`);
  console.log('\nDone.');

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
