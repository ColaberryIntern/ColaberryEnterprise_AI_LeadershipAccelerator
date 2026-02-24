import { connectDatabase, sequelize } from '../config/database';
import '../models';
import { createAdminUser } from '../services/adminService';
import { AdminUser } from '../models';

async function seed() {
  await connectDatabase();
  await sequelize.sync();

  const email = process.argv[2] || 'admin@colaberry.com';
  const password = process.argv[3] || 'ChangeThisPassword123!';

  const existing = await AdminUser.findOne({ where: { email } });
  if (existing) {
    console.log(`Admin user ${email} already exists.`);
    process.exit(0);
  }

  await createAdminUser(email, password);
  console.log(`Admin user created: ${email}`);
  console.log('IMPORTANT: Change the default password in production!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
