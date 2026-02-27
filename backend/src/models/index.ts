import Cohort from './Cohort';
import Enrollment from './Enrollment';
import AdminUser from './AdminUser';
import Lead from './Lead';
import AutomationLog from './AutomationLog';
import Activity from './Activity';
import Appointment from './Appointment';
import FollowUpSequence from './FollowUpSequence';
import ScheduledEmail from './ScheduledEmail';
import SystemSetting from './SystemSetting';
import EventLedger from './EventLedger';
import Campaign from './Campaign';
import CampaignLead from './CampaignLead';
import InteractionOutcome from './InteractionOutcome';
import ICPInsight from './ICPInsight';
import LeadTemperatureHistory from './LeadTemperatureHistory';
import StrategyCall from './StrategyCall';
import StrategyCallIntelligence from './StrategyCallIntelligence';

// Associations
Cohort.hasMany(Enrollment, { foreignKey: 'cohort_id', as: 'enrollments' });
Enrollment.belongsTo(Cohort, { foreignKey: 'cohort_id', as: 'cohort' });

Lead.belongsTo(AdminUser, { foreignKey: 'assigned_admin', as: 'assignedAdmin' });
AdminUser.hasMany(Lead, { foreignKey: 'assigned_admin', as: 'assignedLeads' });

Lead.hasMany(Activity, { foreignKey: 'lead_id', as: 'activities' });
Activity.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

AdminUser.hasMany(Activity, { foreignKey: 'admin_user_id', as: 'activities' });
Activity.belongsTo(AdminUser, { foreignKey: 'admin_user_id', as: 'adminUser' });

Lead.hasMany(Appointment, { foreignKey: 'lead_id', as: 'appointments' });
Appointment.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

AdminUser.hasMany(Appointment, { foreignKey: 'admin_user_id', as: 'appointments' });
Appointment.belongsTo(AdminUser, { foreignKey: 'admin_user_id', as: 'adminUser' });

Lead.hasMany(ScheduledEmail, { foreignKey: 'lead_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

FollowUpSequence.hasMany(ScheduledEmail, { foreignKey: 'sequence_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });

// Campaign associations
Campaign.belongsTo(FollowUpSequence, { foreignKey: 'sequence_id', as: 'sequence' });
FollowUpSequence.hasOne(Campaign, { foreignKey: 'sequence_id', as: 'campaign' });

Campaign.belongsTo(AdminUser, { foreignKey: 'created_by', as: 'creator' });
AdminUser.hasMany(Campaign, { foreignKey: 'created_by', as: 'campaigns' });

Campaign.hasMany(CampaignLead, { foreignKey: 'campaign_id', as: 'campaignLeads' });
CampaignLead.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

CampaignLead.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(CampaignLead, { foreignKey: 'lead_id', as: 'campaignEnrollments' });

Campaign.hasMany(ScheduledEmail, { foreignKey: 'campaign_id', as: 'scheduledEmails' });
ScheduledEmail.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Interaction Outcome associations
Lead.hasMany(InteractionOutcome, { foreignKey: 'lead_id', as: 'interactionOutcomes' });
InteractionOutcome.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Campaign.hasMany(InteractionOutcome, { foreignKey: 'campaign_id', as: 'interactionOutcomes' });
InteractionOutcome.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

ScheduledEmail.hasMany(InteractionOutcome, { foreignKey: 'scheduled_email_id', as: 'outcomes' });
InteractionOutcome.belongsTo(ScheduledEmail, { foreignKey: 'scheduled_email_id', as: 'scheduledEmail' });

// Strategy Call associations
StrategyCall.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });
Lead.hasMany(StrategyCall, { foreignKey: 'lead_id', as: 'strategyCalls' });
StrategyCall.hasOne(StrategyCallIntelligence, { foreignKey: 'strategy_call_id', as: 'intelligence' });
StrategyCallIntelligence.belongsTo(StrategyCall, { foreignKey: 'strategy_call_id', as: 'strategyCall' });
StrategyCallIntelligence.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

// Lead Temperature History associations
Lead.hasMany(LeadTemperatureHistory, { foreignKey: 'lead_id', as: 'temperatureHistory' });
LeadTemperatureHistory.belongsTo(Lead, { foreignKey: 'lead_id', as: 'lead' });

Campaign.hasMany(LeadTemperatureHistory, { foreignKey: 'campaign_id', as: 'temperatureChanges' });
LeadTemperatureHistory.belongsTo(Campaign, { foreignKey: 'campaign_id', as: 'campaign' });

export {
  Cohort, Enrollment, AdminUser, Lead, AutomationLog,
  Activity, Appointment, FollowUpSequence, ScheduledEmail,
  SystemSetting, EventLedger, Campaign, CampaignLead,
  InteractionOutcome, ICPInsight, LeadTemperatureHistory,
  StrategyCall, StrategyCallIntelligence,
};
