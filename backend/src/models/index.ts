import Cohort from './Cohort';
import Enrollment from './Enrollment';
import AdminUser from './AdminUser';
import Lead from './Lead';
import AutomationLog from './AutomationLog';

// Associations
Cohort.hasMany(Enrollment, { foreignKey: 'cohort_id', as: 'enrollments' });
Enrollment.belongsTo(Cohort, { foreignKey: 'cohort_id', as: 'cohort' });

Lead.belongsTo(AdminUser, { foreignKey: 'assigned_admin', as: 'assignedAdmin' });
AdminUser.hasMany(Lead, { foreignKey: 'assigned_admin', as: 'assignedLeads' });

export { Cohort, Enrollment, AdminUser, Lead, AutomationLog };
