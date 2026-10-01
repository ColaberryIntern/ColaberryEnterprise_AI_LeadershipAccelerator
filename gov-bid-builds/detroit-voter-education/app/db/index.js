const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'error',
    service: 'detroit-voter-education',
    event: 'db_pool_error',
    error_class: 'DatabasePoolError',
    error: err.message,
  }));
});

module.exports = pool;
