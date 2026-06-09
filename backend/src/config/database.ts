import { Sequelize } from 'sequelize';
import { env } from './env';

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'postgres',
  logging: env.nodeEnv === 'development' ? console.log : false,
  pool: {
    max: 20,    // supports 25 concurrent students + CB PMO batch headroom
    min: 2,     // keep 2 warm connections always ready
    acquire: 30000, // fail fast if pool exhausted rather than hanging
    idle: 10000,
  },
});

export async function connectDatabase(): Promise<void> {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');
  } catch (error) {
    console.error('Unable to connect to database:', error);
  }
}
