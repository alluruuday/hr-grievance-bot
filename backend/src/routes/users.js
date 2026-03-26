/**
 * User Management API (admin only)
 *
 * GET    /api/users          → list all users with pagination/search
 * GET    /api/users/:id      → single user
 * PATCH  /api/users/:id      → update role, department, is_active
 * DELETE /api/users/:id      → deactivate (soft delete)
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const db = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();

const VALID_ROLES = ['employee', 'hrbp', 'px_lead', 'admin'];

// GET /api/users
router.get('/', requireAuth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { page = 1, limit = 50, search, role } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [parseInt(limit), offset];
    const conditions = [];
    let idx = 3;

    if (search) {
      conditions.push(`(u.name ILIKE $${idx} OR u.email ILIKE $${idx} OR u.employee_id ILIKE $${idx})`);
      params.push(`%${search}%`);
      idx++;
    }
    if (role) {
      conditions.push(`u.role = $${idx}`);
      params.push(role);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.department,
              u.is_active, u.avatar_url, u.created_at,
              u.google_id IS NOT NULL AS has_google,
              COUNT(t.id) AS ticket_count
       FROM users u
       LEFT JOIN tickets t ON t.employee_id = u.id
       ${where}
       GROUP BY u.id
       ORDER BY u.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM users u ${where}`,
      params.slice(2)
    );

    res.json({ users: rows, total: parseInt(countRows[0].count) });
  } catch (err) { next(err); }
});

// GET /api/users/:id
router.get('/:id', requireAuth, requireMinRole('admin'), async (req, res, next) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.employee_id, u.name, u.email, u.role, u.department,
              u.is_active, u.avatar_url, u.created_at,
              u.google_id IS NOT NULL AS has_google,
              COUNT(t.id) AS ticket_count
       FROM users u
       LEFT JOIN tickets t ON t.employee_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

// PATCH /api/users/:id
router.patch('/:id',
  requireAuth, requireMinRole('admin'),
  body('role').optional().isIn(VALID_ROLES),
  body('department').optional().trim(),
  body('is_active').optional().isBoolean(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      // Prevent admin from demoting themselves
      if (req.params.id === req.user.id && req.body.role && req.body.role !== 'admin') {
        return res.status(400).json({ error: 'You cannot change your own role.' });
      }
      if (req.params.id === req.user.id && req.body.is_active === false) {
        return res.status(400).json({ error: 'You cannot deactivate your own account.' });
      }

      const allowed = ['role', 'department', 'is_active'];
      const sets = [];
      const vals = [];
      let idx = 1;

      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          sets.push(`${key} = $${idx++}`);
          vals.push(req.body[key]);
        }
      }

      if (!sets.length) return res.status(400).json({ error: 'Nothing to update.' });

      vals.push(req.params.id);
      const { rows } = await db.query(
        `UPDATE users SET ${sets.join(', ')} WHERE id = $${idx}
         RETURNING id, employee_id, name, email, role, department, is_active`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: 'User not found' });

      logger.info('User updated by admin', { adminId: req.user.id, targetId: req.params.id, changes: req.body });
      res.json({ user: rows[0] });
    } catch (err) { next(err); }
  }
);

// DELETE /api/users/:id — soft deactivate
router.delete('/:id', requireAuth, requireMinRole('admin'), async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot deactivate your own account.' });
    }
    const { rows } = await db.query(
      `UPDATE users SET is_active = FALSE WHERE id = $1
       RETURNING id, name, email, is_active`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    logger.info('User deactivated by admin', { adminId: req.user.id, targetId: req.params.id });
    res.json({ user: rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
