/**
 * Analytics API (section 6 of PRD)
 *
 * GET /api/analytics/summary     → overview + by_category + feedback + escalations
 * GET /api/analytics/tickets     → time-series ticket data
 */

const express = require('express');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { Analytics } = require('../models');

const router = express.Router();

// GET /api/analytics/summary
router.get('/summary', requireAuth, requireMinRole('hrbp'), async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const data = await Analytics.summary({
      from: from ? new Date(from) : null,
      to: to ? new Date(to) : null,
    });
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/analytics/tickets — weekly/monthly ticket volumes
router.get('/tickets', requireAuth, requireMinRole('hrbp'), async (req, res, next) => {
  try {
    const { from, to, groupBy = 'week' } = req.query;
    const db = require('../config/database');

    const trunc = groupBy === 'month' ? 'month' : 'week';
    const { rows } = await db.query(
      `SELECT DATE_TRUNC($1, created_at) AS period,
              COUNT(*) AS total,
              COUNT(*) FILTER (WHERE status IN ('closed','resolved')) AS resolved,
              COUNT(*) FILTER (WHERE status = 'escalated') AS escalated
       FROM tickets
       WHERE ($2::TIMESTAMPTZ IS NULL OR created_at >= $2)
         AND ($3::TIMESTAMPTZ IS NULL OR created_at <= $3)
       GROUP BY period ORDER BY period ASC`,
      [trunc, from || null, to || null]
    );

    res.json({ timeSeries: rows, groupBy });
  } catch (err) { next(err); }
});

module.exports = router;
