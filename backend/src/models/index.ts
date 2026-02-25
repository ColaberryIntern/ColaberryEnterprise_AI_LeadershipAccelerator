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

export {
  Cohort, Enrollment, AdminUser, Lead, AutomationLog,
  Activity, Appointment, FollowUpSequence, ScheduledEmail,
  SystemSetting, EventLedger,
};
