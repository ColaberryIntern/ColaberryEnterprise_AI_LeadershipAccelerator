import { Op } from 'sequelize';
import { Lead, ScheduledEmail, CampaignLead } from '../../models';
import { env } from '../../config/env';
import { TEST_EMAIL_DOMAIN } from './testLeadGenerator';

export interface CampaignTestSafetyReport {
  timestamp: string;
  testEmailDomain: string;
  testLeads: {
    total: number;
    withRealEmailDomain: number;
    unsafeEmails: string[];
  };
  scheduledActions: {
    pendingTestActions: number;
    testActionsWithRealDomain: number;
    unsafeActionIds: string[];
  };
  duplicateEnrollments: {
    count: number;
    details: { lead_id: number; campaign_id: string; enrollment_count: number }[];
  };
  orphanedTestActions: {
    count: number;
    actionIds: string[];
  };
  verdict: 'SAFE' | 'WARNINGS' | 'UNSAFE';
  issues: string[];
}

/**
 * Audit the campaign test system for safety violations.
 * Scans for test leads with real email domains, test actions targeting real inboxes,
 * duplicate enrollments, and orphaned scheduled actions.
 */
export async function auditCampaignTestSafety(): Promise<CampaignTestSafetyReport> {
  const issues: string[] = [];
  const testDomain = TEST_EMAIL_DOMAIN;

  // 1. Find test leads
  const testLeads = await Lead.unscoped().findAll({
    where: { source: 'campaign_test' },
    attributes: ['id', 'email', 'name'],
    raw: true,
  }) as any[];

  const unsafeTestLeadEmails = testLeads
    .filter((l: any) => l.email && !l.email.endsWith(testDomain))
    .map((l: any) => l.email);

  if (unsafeTestLeadEmails.length > 0) {
    issues.push(`${unsafeTestLeadEmails.length} test lead(s) have real email domains: ${unsafeTestLeadEmails.join(', ')}`);
  }

  const testLeadIds = testLeads.map((l: any) => l.id);

  // 2. Find pending test scheduled actions
  const pendingTestActions = await ScheduledEmail.count({
    where: {
      is_test_action: true,
      status: { [Op.in]: ['pending', 'processing'] },
    },
  });

  // Find test actions targeting non-test domains
  const unsafeTestActions = await ScheduledEmail.findAll({
    where: {
      is_test_action: true,
      status: { [Op.in]: ['pending', 'processing'] },
      to_email: { [Op.notLike]: `%${testDomain}` },
    },
    attributes: ['id', 'to_email', 'campaign_id'],
    raw: true,
  }) as any[];

  if (unsafeTestActions.length > 0) {
    issues.push(`${unsafeTestActions.length} pending test action(s) target real email domains`);
  }

  // 3. Find duplicate enrollments (same lead enrolled multiple times in same campaign)
  const duplicateEnrollments: { lead_id: number; campaign_id: string; enrollment_count: number }[] = [];
  if (testLeadIds.length > 0) {
    const dupes = await CampaignLead.findAll({
      where: { lead_id: { [Op.in]: testLeadIds } },
      attributes: ['lead_id', 'campaign_id'],
      raw: true,
    }) as any[];

    // Count by lead_id + campaign_id
    const counts = new Map<string, { lead_id: number; campaign_id: string; count: number }>();
    for (const d of dupes) {
      const key = `${d.lead_id}-${d.campaign_id}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { lead_id: d.lead_id, campaign_id: d.campaign_id, count: 1 });
      }
    }
    for (const entry of counts.values()) {
      if (entry.count > 1) {
        duplicateEnrollments.push({
          lead_id: entry.lead_id,
          campaign_id: entry.campaign_id,
          enrollment_count: entry.count,
        });
      }
    }
  }

  if (duplicateEnrollments.length > 0) {
    issues.push(`${duplicateEnrollments.length} duplicate test lead enrollment(s) found`);
  }

  // 4. Find orphaned test actions (test lead actions that weren't cleaned up)
  let orphanedTestActions: any[] = [];
  if (testLeadIds.length > 0) {
    orphanedTestActions = await ScheduledEmail.findAll({
      where: {
        lead_id: { [Op.in]: testLeadIds },
        status: { [Op.in]: ['pending', 'processing'] },
      },
      attributes: ['id'],
      raw: true,
    }) as any[];

    if (orphanedTestActions.length > 0) {
      issues.push(`${orphanedTestActions.length} orphaned pending action(s) for test leads`);
    }
  }

  // Determine verdict
  let verdict: 'SAFE' | 'WARNINGS' | 'UNSAFE' = 'SAFE';
  if (unsafeTestActions.length > 0 || unsafeTestLeadEmails.length > 0) {
    verdict = 'UNSAFE';
  } else if (orphanedTestActions.length > 0 || duplicateEnrollments.length > 0 || pendingTestActions > 0) {
    verdict = 'WARNINGS';
  }

  const report: CampaignTestSafetyReport = {
    timestamp: new Date().toISOString(),
    testEmailDomain: testDomain,
    testLeads: {
      total: testLeads.length,
      withRealEmailDomain: unsafeTestLeadEmails.length,
      unsafeEmails: unsafeTestLeadEmails,
    },
    scheduledActions: {
      pendingTestActions,
      testActionsWithRealDomain: unsafeTestActions.length,
      unsafeActionIds: unsafeTestActions.map((a: any) => a.id),
    },
    duplicateEnrollments: {
      count: duplicateEnrollments.length,
      details: duplicateEnrollments,
    },
    orphanedTestActions: {
      count: orphanedTestActions.length,
      actionIds: orphanedTestActions.map((a: any) => a.id),
    },
    verdict,
    issues,
  };

  console.log(`[CampaignTestSafety] Audit complete — verdict: ${verdict}, issues: ${issues.length}`);
  if (issues.length > 0) {
    for (const issue of issues) {
      console.warn(`[CampaignTestSafety]   ⚠ ${issue}`);
    }
  }

  return report;
}
