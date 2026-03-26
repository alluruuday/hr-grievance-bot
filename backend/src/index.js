require('dotenv').config();
const express  = require('express');
const helmet   = require('helmet');
const cors     = require('cors');
const passport = require('passport');
const logger   = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Security & Parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(passport.initialize());  // stateless — no sessions needed

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',      require('./routes/auth'));
app.use('/api/chat',      require('./routes/chat'));
app.use('/api/tickets',   require('./routes/tickets'));
app.use('/api/knowledge', require('./routes/knowledge'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/users',     require('./routes/users'));

// ─── 404 ─────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// ─── Error Handler ────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Start ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', async () => {
  logger.info(`Backend listening on port ${PORT}`);

  // Verify DB connection
  try {
    const { pool } = require('./config/database');
    await pool.query('SELECT 1');
    logger.info('Database connected');
  } catch (err) {
    logger.error('Database connection failed', { error: err.message });
    process.exit(1);
  }

  // Start cron jobs
  require('./jobs/cron').startCronJobs();
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err.message });
});
