// ─── Production Launch Data Cleanup ──────────────────────────────────────────
// POST /api/admin/production-cleanup?mode=dry-run|execute
//
// Phases:
//  1. Identify test enrollments (cohorts named "Cohort N — ...")
//  2. Cascade analysis (dry-run report)
//  3. Hard delete test data (execute mode only)
//  4. Rename cohorts to production format
//  5. Data integrity validation
//  6. Campaign flow validation
//  7. Final report
//
// SAFETY: Protected campaigns (alumni, cold_outbound) are NEVER touched.
//         Lead records are NEVER deleted.

import { Router, Request, Response } from 'express';
import { Op } from 'sequelize';
import { sequelize } from '../../config/database';
import {
  Cohort, Enrollment, Lead, Campaign, CampaignLead,
  ScheduledEmail, CommunicationLog, InteractionOutcome,
  AttendanceRecord, AssignmentSubmission, VariableStore,
  CampaignSimulation, CampaignSimulationStep,
  CampaignTestRun, CampaignTestStep,
  LessonInstance, UserCurriculumProfile,
  MentorConversation, SessionChatMessage, SkillMastery,
  GitHubConnection, StudentNavigationEvent,
  Project, ProjectArtifact, MentorIntervention, RequirementsGenerationJob,
  LeadTemperatureHistory,
} from '../../models';

const router = Router();

// Protected campaign types — NEVER touch campaign_leads for these
const PROTECTED_CAMPAIGN_TYPES = ['alumni', 'alumni_re_engagement', 'cold_outbound'];

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a cohort name matches the test pattern "Cohort N — ..." */
function isTestCohortName(name: string): boolean {
  return /^Cohort\s+\d+/i.test(name);
}

/** Get IDs of protected campaigns */
async function getProtectedCampaignIds(): Promise<string[]> {
  const campaigns = await Campaign.findAll({
    where: { type: { [Op.in]: PROTECTED_CAMPAIGN_TYPES } },
    attributes: ['id'],
    raw: true,
  });
  return campaigns.map((c: any) => c.id);
}

/** Get lead IDs by emails */
async function getLeadIdsByEmails(emails: string[]): Promise<number[]> {
  if (emails.length === 0) return [];
  const leads = await Lead.unscoped().findAll({
    where: { email: { [Op.in]: emails } },
    attributes: ['id'],
    raw: true,
  });
  return leads.map((l: any) => l.id);
}

/** Check if an email is in a protected campaign */
async function getProtectedEmails(protectedCampaignIds: string[]): Promise<Set<string>> {
  if (protectedCampaignIds.length === 0) return new Set();
  const protectedLeads = await CampaignLead.findAll({
    where: { campaign_id: { [Op.in]: protectedCampaignIds } },
    include: [{ model: Lead.unscoped(), as: 'lead', attributes: ['email'] }],
    raw: true,
    nest: true,
  });
  return new Set(protectedLeads.map((cl: any) => (cl.lead?.email || '').toLowerCase()).filter(Boolean));
}

/** Safe count helper */
async function safeCount(model: any, where: Record<string, any>): Promise<number> {
  try {
    return await model.count({ where });
  } catch {
    return 0;
  }
}

// ─── Main Endpoint ──────────────────────────────────────────────────────────

router.post('/api/admin/production-cleanup', async (req: Request, res: Response) => {
  const mode = (req.query.mode as string) || 'dry-run';
  const isExecute = mode === 'execute';
  const report: Record<string, any> = {
    mode,
    timestamp: new Date().toISOString(),
    errors: [] as string[],
    warnings: [] as string[],
    recommendations: [] as string[],
  };

  try {
    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 1 — Identify Test Data
    // ═══════════════════════════════════════════════════════════════════════

    const allCohorts = await Cohort.findAll({ raw: true }) as any[];
    const testCohorts = allCohorts.filter((c: any) => isTestCohortName(c.name));
    const testCohortIds = testCohorts.map((c: any) => c.id);

    // Get protected campaign IDs and protected emails
    const protectedCampaignIds = await getProtectedCampaignIds();
    const protectedEmails = await getProtectedEmails(protectedCampaignIds);

    // Get all enrollments in test cohorts
    const testCohortEnrollments = testCohortIds.length > 0
      ? await Enrollment.findAll({
          where: { cohort_id: { [Op.in]: testCohortIds } },
          raw: true,
        }) as any[]
      : [];

    // Separate into test vs protected
    const testEnrollments: any[] = [];
    const protectedEnrollments: any[] = [];

    for (const enrollment of testCohortEnrollments) {
      const email = (enrollment.email || '').toLowerCase();
      if (protectedEmails.has(email)) {
        protectedEnrollments.push(enrollment);
      } else {
        testEnrollments.push(enrollment);
      }
    }

    const testEnrollmentIds = testEnrollments.map((e: any) => e.id);
    const testEmails = testEnrollments.map((e: any) => (e.email || '').toLowerCase()).filter(Boolean);
    const testLeadIds = await getLeadIdsByEmails(testEmails);

    const totalEnrollments = await Enrollment.count();

    report.phase_1_identification = {
      total_cohorts: allCohorts.length,
      test_cohorts: testCohorts.map((c: any) => ({ id: c.id, name: c.name })),
      total_enrollments: totalEnrollments,
      test_enrollments: testEnrollments.length,
      protected_enrollments: protectedEnrollments.length,
      protected_emails: Array.from(protectedEmails),
      test_enrollment_ids: testEnrollmentIds,
      test_lead_ids: testLeadIds,
    };

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 2 — Cascade Analysis
    // ═══════════════════════════════════════════════════════════════════════

    const nonProtectedCampaignWhere = protectedCampaignIds.length > 0
      ? { [Op.or]: [{ campaign_id: { [Op.notIn]: protectedCampaignIds } }, { campaign_id: null }] }
      : {};

    const cascade: Record<string, number> = {};

    if (testLeadIds.length > 0) {
      cascade.scheduled_emails = await safeCount(ScheduledEmail, {
        lead_id: { [Op.in]: testLeadIds },
        ...nonProtectedCampaignWhere,
      });
      cascade.interaction_outcomes = await safeCount(InteractionOutcome, {
        lead_id: { [Op.in]: testLeadIds },
        ...nonProtectedCampaignWhere,
      });
      cascade.communication_logs = await safeCount(CommunicationLog, {
        lead_id: { [Op.in]: testLeadIds },
        ...nonProtectedCampaignWhere,
      });
      cascade.campaign_leads = await safeCount(CampaignLead, {
        lead_id: { [Op.in]: testLeadIds },
        ...(protectedCampaignIds.length > 0 ? { campaign_id: { [Op.notIn]: protectedCampaignIds } } : {}),
      });
      cascade.lead_temperature_history = await safeCount(LeadTemperatureHistory, {
        lead_id: { [Op.in]: testLeadIds },
        ...nonProtectedCampaignWhere,
      });
    } else {
      cascade.scheduled_emails = 0;
      cascade.interaction_outcomes = 0;
      cascade.communication_logs = 0;
      cascade.campaign_leads = 0;
      cascade.lead_temperature_history = 0;
    }

    // Campaign simulations & test runs (all of them — these are test infrastructure)
    cascade.campaign_simulation_steps = await safeCount(CampaignSimulationStep, {});
    cascade.campaign_simulations = await safeCount(CampaignSimulation, {});
    cascade.campaign_test_steps = await safeCount(CampaignTestStep, {});
    cascade.campaign_test_runs = await safeCount(CampaignTestRun, {});

    // Enrollment-linked records
    if (testEnrollmentIds.length > 0) {
      cascade.assignment_submissions = await safeCount(AssignmentSubmission, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.attendance_records = await safeCount(AttendanceRecord, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.variable_stores = await safeCount(VariableStore, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.lesson_instances = await safeCount(LessonInstance, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.user_curriculum_profiles = await safeCount(UserCurriculumProfile, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.mentor_conversations = await safeCount(MentorConversation, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.session_chat_messages = await safeCount(SessionChatMessage, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.skill_masteries = await safeCount(SkillMastery, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.github_connections = await safeCount(GitHubConnection, { enrollment_id: { [Op.in]: testEnrollmentIds } });
      cascade.student_navigation_events = await safeCount(StudentNavigationEvent, { enrollment_id: { [Op.in]: testEnrollmentIds } });

      // Projects (and their children)
      const testProjects = await Project.findAll({
        where: { enrollment_id: { [Op.in]: testEnrollmentIds } },
        attributes: ['id'],
        raw: true,
      }) as any[];
      const testProjectIds = testProjects.map((p: any) => p.id);
      cascade.projects = testProjectIds.length;

      if (testProjectIds.length > 0) {
        cascade.project_artifacts = await safeCount(ProjectArtifact, { project_id: { [Op.in]: testProjectIds } });
        cascade.mentor_interventions = await safeCount(MentorIntervention, { project_id: { [Op.in]: testProjectIds } });
        cascade.requirements_generation_jobs = await safeCount(RequirementsGenerationJob, { project_id: { [Op.in]: testProjectIds } });
      } else {
        cascade.project_artifacts = 0;
        cascade.mentor_interventions = 0;
        cascade.requirements_generation_jobs = 0;
      }

      cascade.enrollments = testEnrollmentIds.length;
    } else {
      cascade.assignment_submissions = 0;
      cascade.attendance_records = 0;
      cascade.variable_stores = 0;
      cascade.lesson_instances = 0;
      cascade.user_curriculum_profiles = 0;
      cascade.mentor_conversations = 0;
      cascade.session_chat_messages = 0;
      cascade.skill_masteries = 0;
      cascade.github_connections = 0;
      cascade.student_navigation_events = 0;
      cascade.projects = 0;
      cascade.project_artifacts = 0;
      cascade.mentor_interventions = 0;
      cascade.requirements_generation_jobs = 0;
      cascade.enrollments = 0;
    }

    cascade.leads_preserved = testLeadIds.length;
    cascade.protected_campaign_leads_preserved = protectedEnrollments.length;

    report.phase_2_cascade_analysis = cascade;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 3 — Cascading Delete (Execute Mode Only)
    // ═══════════════════════════════════════════════════════════════════════

    if (isExecute) {
      const deletionResults: Record<string, number> = {};

      await sequelize.transaction(async (t) => {
        const txOpts = { transaction: t };

        // 1. Scheduled emails (lead-linked, non-protected campaigns)
        if (testLeadIds.length > 0) {
          deletionResults.scheduled_emails = await ScheduledEmail.destroy({
            where: { lead_id: { [Op.in]: testLeadIds }, ...nonProtectedCampaignWhere },
            ...txOpts,
          });

          // 2. Interaction outcomes
          deletionResults.interaction_outcomes = await InteractionOutcome.destroy({
            where: { lead_id: { [Op.in]: testLeadIds }, ...nonProtectedCampaignWhere },
            ...txOpts,
          });

          // 3. Communication logs
          deletionResults.communication_logs = await CommunicationLog.destroy({
            where: { lead_id: { [Op.in]: testLeadIds }, ...nonProtectedCampaignWhere },
            ...txOpts,
          });

          // 4. Lead temperature history
          deletionResults.lead_temperature_history = await LeadTemperatureHistory.destroy({
            where: { lead_id: { [Op.in]: testLeadIds }, ...nonProtectedCampaignWhere },
            ...txOpts,
          });

          // 5. Campaign leads (non-protected)
          deletionResults.campaign_leads = await CampaignLead.destroy({
            where: {
              lead_id: { [Op.in]: testLeadIds },
              ...(protectedCampaignIds.length > 0 ? { campaign_id: { [Op.notIn]: protectedCampaignIds } } : {}),
            },
            ...txOpts,
          });
        }

        // 6. Campaign simulation data (all — test infrastructure)
        deletionResults.campaign_simulation_steps = await CampaignSimulationStep.destroy({ where: {}, ...txOpts });
        deletionResults.campaign_simulations = await CampaignSimulation.destroy({ where: {}, ...txOpts });

        // 7. Campaign test runs (all — test infrastructure)
        deletionResults.campaign_test_steps = await CampaignTestStep.destroy({ where: {}, ...txOpts });
        deletionResults.campaign_test_runs = await CampaignTestRun.destroy({ where: {}, ...txOpts });

        // 8. Enrollment-linked records
        if (testEnrollmentIds.length > 0) {
          const enrollWhere = { enrollment_id: { [Op.in]: testEnrollmentIds } };

          // Project children first
          const testProjects = await Project.findAll({
            where: enrollWhere,
            attributes: ['id'],
            raw: true,
            ...txOpts,
          }) as any[];
          const testProjectIds = testProjects.map((p: any) => p.id);

          if (testProjectIds.length > 0) {
            deletionResults.mentor_interventions = await MentorIntervention.destroy({
              where: { project_id: { [Op.in]: testProjectIds } },
              ...txOpts,
            });
            deletionResults.requirements_generation_jobs = await RequirementsGenerationJob.destroy({
              where: { project_id: { [Op.in]: testProjectIds } },
              ...txOpts,
            });
            deletionResults.project_artifacts = await ProjectArtifact.destroy({
              where: { project_id: { [Op.in]: testProjectIds } },
              ...txOpts,
            });
          }
          deletionResults.projects = await Project.destroy({ where: enrollWhere, ...txOpts });

          // Other enrollment-linked tables
          deletionResults.student_navigation_events = await StudentNavigationEvent.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.session_chat_messages = await SessionChatMessage.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.mentor_conversations = await MentorConversation.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.skill_masteries = await SkillMastery.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.lesson_instances = await LessonInstance.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.user_curriculum_profiles = await UserCurriculumProfile.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.github_connections = await GitHubConnection.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.assignment_submissions = await AssignmentSubmission.destroy({ where: enrollWhere, ...txOpts });
          deletionResults.attendance_records = await AttendanceRecord.destroy({ where: enrollWhere, ...txOpts });
          // VariableStore has CASCADE but destroy explicitly to be safe
          deletionResults.variable_stores = await VariableStore.destroy({ where: enrollWhere, ...txOpts });

          // 9. Delete test enrollments
          deletionResults.enrollments = await Enrollment.destroy({
            where: { id: { [Op.in]: testEnrollmentIds } },
            ...txOpts,
          });
        }

        // 10. Recalculate cohort seat counts
        for (const cohort of testCohorts) {
          const remaining = await Enrollment.count({ where: { cohort_id: cohort.id }, ...txOpts });
          await Cohort.update({ seats_taken: remaining }, { where: { id: cohort.id }, ...txOpts });
        }
      });

      report.phase_3_deletion_results = deletionResults;
    } else {
      report.phase_3_deletion_results = 'SKIPPED — dry-run mode. Pass ?mode=execute to delete.';
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 4 — Cohort Renaming
    // ═══════════════════════════════════════════════════════════════════════

    const renameResults: Array<{ old_name: string; new_name: string }> = [];

    // Refresh cohort data (may have changed seat counts)
    const currentCohorts = await Cohort.findAll({ raw: true }) as any[];

    for (const cohort of currentCohorts) {
      if (isTestCohortName(cohort.name)) {
        const startDate = new Date(cohort.start_date);
        const monthName = startDate.toLocaleString('en-US', { month: 'long' });
        const year = startDate.getFullYear();
        const newName = `Cohort \u2014 ${monthName} ${year}`;

        if (isExecute) {
          await Cohort.update({ name: newName }, { where: { id: cohort.id } });
        }

        renameResults.push({ old_name: cohort.name, new_name: newName });
      }
    }

    report.phase_4_cohort_renames = isExecute
      ? { status: 'executed', renames: renameResults }
      : { status: 'dry-run preview', renames: renameResults };

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 5 — Data Integrity Validation
    // ═══════════════════════════════════════════════════════════════════════

    const integrity: Record<string, any> = {};

    // Check cohort seat counts match actual enrollments
    const cohortChecks: Array<{ name: string; seats_taken: number; actual: number; match: boolean }> = [];
    const freshCohorts = await Cohort.findAll({ raw: true }) as any[];
    for (const cohort of freshCohorts) {
      const actual = await Enrollment.count({ where: { cohort_id: cohort.id } });
      cohortChecks.push({
        name: isExecute && isTestCohortName(cohort.name) ? renameResults.find(r => r.old_name === cohort.name)?.new_name || cohort.name : cohort.name,
        seats_taken: cohort.seats_taken,
        actual,
        match: cohort.seats_taken === actual || (isExecute && actual === 0),
      });
    }
    integrity.cohort_seat_counts = cohortChecks;

    // Check for orphan campaign_leads (lead_id references non-existent leads)
    const orphanCampaignLeads = await sequelize.query(
      `SELECT cl.id FROM campaign_leads cl LEFT JOIN leads l ON cl.lead_id = l.id WHERE l.id IS NULL`,
      { type: 'SELECT' as any }
    );
    integrity.orphan_campaign_leads = (orphanCampaignLeads as any[]).length;

    // Check for pending scheduled_emails referencing non-existent leads
    const orphanEmails = await sequelize.query(
      `SELECT se.id FROM scheduled_emails se LEFT JOIN leads l ON se.lead_id = l.id WHERE l.id IS NULL AND se.status IN ('pending', 'processing')`,
      { type: 'SELECT' as any }
    );
    integrity.orphan_scheduled_emails = (orphanEmails as any[]).length;

    report.phase_5_integrity_check = integrity;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 6 — Campaign Flow Validation
    // ═══════════════════════════════════════════════════════════════════════

    const flowValidation: Record<string, any> = {};

    // Check for leads in multiple primary campaigns simultaneously
    const duplicateCampaignLeads = await sequelize.query(
      `SELECT cl.lead_id, COUNT(*) as campaign_count
       FROM campaign_leads cl
       JOIN campaigns c ON cl.campaign_id = c.id
       WHERE cl.status IN ('enrolled', 'active')
         AND c.type IN ('payment_readiness', 'warm_nurture')
         AND c.status = 'active'
       GROUP BY cl.lead_id
       HAVING COUNT(*) > 1`,
      { type: 'SELECT' as any }
    );
    flowValidation.leads_in_multiple_campaigns = (duplicateCampaignLeads as any[]).length;
    if ((duplicateCampaignLeads as any[]).length > 0) {
      report.warnings.push(`${(duplicateCampaignLeads as any[]).length} leads enrolled in multiple active campaigns simultaneously`);
    }

    // Check for duplicate scheduled emails (same lead + same step_index + pending)
    const duplicateScheduledEmails = await sequelize.query(
      `SELECT lead_id, campaign_id, step_index, COUNT(*) as dup_count
       FROM scheduled_emails
       WHERE status IN ('pending', 'processing')
       GROUP BY lead_id, campaign_id, step_index
       HAVING COUNT(*) > 1`,
      { type: 'SELECT' as any }
    );
    flowValidation.duplicate_scheduled_emails = (duplicateScheduledEmails as any[]).length;
    if ((duplicateScheduledEmails as any[]).length > 0) {
      report.warnings.push(`${(duplicateScheduledEmails as any[]).length} duplicate pending emails detected`);
    }

    // Check for back-to-back voice calls (< 2 day gap)
    const backToBackCalls = await sequelize.query(
      `SELECT se1.lead_id, se1.scheduled_for as call1, se2.scheduled_for as call2
       FROM scheduled_emails se1
       JOIN scheduled_emails se2 ON se1.lead_id = se2.lead_id
         AND se1.campaign_id = se2.campaign_id
         AND se1.id < se2.id
       WHERE se1.channel = 'voice' AND se2.channel = 'voice'
         AND se1.status IN ('pending', 'processing')
         AND se2.status IN ('pending', 'processing')
         AND se2.scheduled_for - se1.scheduled_for < INTERVAL '2 days'`,
      { type: 'SELECT' as any }
    );
    flowValidation.back_to_back_voice_calls = (backToBackCalls as any[]).length;
    if ((backToBackCalls as any[]).length > 0) {
      report.warnings.push(`${(backToBackCalls as any[]).length} back-to-back voice calls detected (< 2 day gap)`);
    }

    // Active campaigns summary
    const activeCampaigns = await Campaign.findAll({
      where: { status: 'active' },
      attributes: ['id', 'name', 'type'],
      raw: true,
    });
    flowValidation.active_campaigns = activeCampaigns;

    report.phase_6_flow_validation = flowValidation;

    // ═══════════════════════════════════════════════════════════════════════
    // PHASE 7 — Recommendations
    // ═══════════════════════════════════════════════════════════════════════

    if (testEnrollments.length === 0) {
      report.recommendations.push('No test enrollments found — system may already be clean.');
    }
    if (protectedEnrollments.length > 0) {
      report.recommendations.push(`${protectedEnrollments.length} enrollments preserved due to protected campaign membership.`);
    }
    if (integrity.orphan_campaign_leads > 0) {
      report.warnings.push(`${integrity.orphan_campaign_leads} orphan campaign_lead records found — consider manual cleanup.`);
    }
    if (integrity.orphan_scheduled_emails > 0) {
      report.warnings.push(`${integrity.orphan_scheduled_emails} orphan scheduled_email records found — consider cancellation.`);
    }

    report.success = true;
    res.json(report);
  } catch (err: any) {
    report.success = false;
    report.errors.push(err.message || 'Unknown error');
    console.error('[ProductionCleanup] Error:', err);
    res.status(500).json(report);
  }
});

export default router;
