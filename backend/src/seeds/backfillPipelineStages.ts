import { Op } from 'sequelize';
import { connectDatabase, sequelize } from '../config/database';
import '../models';
import Lead from '../models/Lead';
import StrategyCall from '../models/StrategyCall';
import { ScheduledEmail } from '../models';

const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'meeting_scheduled', 'proposal_sent', 'negotiation', 'enrolled', 'lost',
];

async function backfillPipelineStages() {
  await connectDatabase();
  await sequelize.sync();

  // Step 1: Fix NULL/empty pipeline_stage → 'new_lead'
  const [nullFixCount] = await Lead.update(
    { pipeline_stage: 'new_lead' } as any,
    {
      where: {
        [Op.or]: [
          { pipeline_stage: null as any },
          { pipeline_stage: '' },
        ],
      },
    },
  );
  console.log(`[Backfill] Fixed ${nullFixCount} leads with NULL/empty pipeline_stage → 'new_lead'`);

  // Step 2: Advance leads with StrategyCall records → 'meeting_scheduled'
  // (only if currently new_lead or contacted — don't regress higher stages)
  const leadsWithCalls = await StrategyCall.findAll({
    attributes: ['lead_id'],
    where: { lead_id: { [Op.ne]: null } },
    group: ['lead_id'],
  });
  const callLeadIds = leadsWithCalls
    .map((c: any) => c.lead_id)
    .filter((id: number | null): id is number => id !== null);

  let meetingAdvanced = 0;
  if (callLeadIds.length > 0) {
    const [count] = await Lead.update(
      { pipeline_stage: 'meeting_scheduled', updated_at: new Date() } as any,
      {
        where: {
          id: { [Op.in]: callLeadIds },
          pipeline_stage: { [Op.in]: ['new_lead', 'contacted'] },
        },
      },
    );
    meetingAdvanced = count;
  }
  console.log(`[Backfill] Advanced ${meetingAdvanced} leads → 'meeting_scheduled' (had StrategyCall records)`);

  // Step 3: Advance leads with sent actions → 'contacted'
  // (only if still at 'new_lead' — Step 2 already handled meeting_scheduled)
  const leadsWithSentActions = await ScheduledEmail.findAll({
    attributes: ['lead_id'],
    where: { status: 'sent' },
    group: ['lead_id'],
  });
  const sentLeadIds = leadsWithSentActions.map((a: any) => a.lead_id);

  let contactedAdvanced = 0;
  if (sentLeadIds.length > 0) {
    const [count] = await Lead.update(
      { pipeline_stage: 'contacted', updated_at: new Date() } as any,
      {
        where: {
          id: { [Op.in]: sentLeadIds },
          pipeline_stage: 'new_lead',
        },
      },
    );
    contactedAdvanced = count;
  }
  console.log(`[Backfill] Advanced ${contactedAdvanced} leads → 'contacted' (had sent actions)`);

  // Step 4: Print final distribution
  console.log('\n[Backfill] Final pipeline distribution:');
  for (const stage of PIPELINE_STAGES) {
    const count = await Lead.count({ where: { pipeline_stage: stage } });
    console.log(`  ${stage}: ${count}`);
  }
  const total = await Lead.count();
  console.log(`  Total leads: ${total}`);

  console.log('\n[Backfill] Complete.');
  process.exit(0);
}

backfillPipelineStages().catch((err) => {
  console.error('[Backfill] Failed:', err);
  process.exit(1);
});
