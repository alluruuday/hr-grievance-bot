/**
 * Tickets API
 *
 * GET  /api/tickets              → list tickets (filtered by role)
 * GET  /api/tickets/:id          → get single ticket + audit log
 * PATCH /api/tickets/:id         → update status / assign
 * POST /api/tickets/:id/resolve  → owner marks resolved
 * POST /api/tickets/:id/escalate → manual escalation
 * POST /api/tickets/:id/confirm-resolution → employee confirms/rejects resolution
 * POST /api/tickets/:id/feedback → submit feedback
 */

const express = require('express');
const { body, query, validationResult } = require('express-validator');
const { requireAuth, requireMinRole, canViewTicket } = require('../middleware/auth');
const { Ticket, TicketEscalation, AuditLog, Feedback, User, Category } = require('../models');
const { escalate } = require('../services/escalation');
const { notifyTicketResolved } = require('../services/notifications');
const keka = require('../services/keka');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/tickets
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, categoryId, page = 1, limit = 20 } = req.query;
    const opts = { status, categoryId, page: parseInt(page), limit: parseInt(limit) };
    let tickets;

    if (['admin', 'px_lead'].includes(req.user.role)) {
      tickets = await Ticket.listAll(opts);
    } else if (req.user.role === 'hrbp') {
      tickets = await Ticket.listForAssignee(req.user.id, opts);
    } else {
      tickets = await Ticket.listForEmployee(req.user.id, opts);
    }

    // Mask confidential tickets for employees
    if (req.user.role === 'employee') {
      tickets = tickets.map(t => t.is_confidential ? maskConfidential(t) : t);
    }

    res.json({ tickets, page: parseInt(page) });
  } catch (err) { next(err); }
});

// GET /api/tickets/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

    if (!canAccess(ticket, req.user)) return res.status(403).json({ error: 'Forbidden' });

    const escalations = await TicketEscalation.listByTicket(ticket.id);
    const auditLog = await getAuditLog(ticket.id);

    let data = { ...ticket };
    if (ticket.is_confidential && req.user.role === 'employee') {
      data = maskConfidential(data);
    }

    res.json({ ticket: data, escalations, auditLog });
  } catch (err) { next(err); }
});

// PATCH /api/tickets/:id — update status or assignment (HRBP+)
router.patch('/:id',
  requireAuth, requireMinRole('hrbp'),
  body('status').optional().isIn(['open','in_progress','pending_employee','escalated','resolved','closed']),
  body('assignedTo').optional().isUUID(),
  body('severity').optional().isIn(['low','medium','high','critical']),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const allowed = ['status', 'assignedTo', 'severity'];
      const updates = {};
      for (const k of allowed) {
        if (req.body[k] !== undefined) updates[k] = req.body[k];
      }

      const old = { status: ticket.status, assignedTo: ticket.assigned_to };
      const updated = await Ticket.update(ticket.id, updates);

      await AuditLog.create({
        ticketId: ticket.id,
        actorId: req.user.id,
        action: 'updated',
        oldValue: old,
        newValue: updates,
      });

      res.json({ ticket: updated });
    } catch (err) { next(err); }
  }
);

// POST /api/tickets/:id/resolve — owner marks as resolved
router.post('/:id/resolve',
  requireAuth, requireMinRole('hrbp'),
  body('notes').optional().trim(),
  async (req, res, next) => {
    try {
      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const updated = await Ticket.update(ticket.id, {
        status: 'resolved',
        resolvedAt: new Date(),
      });

      await AuditLog.create({
        ticketId: ticket.id,
        actorId: req.user.id,
        action: 'resolved',
        oldValue: { status: ticket.status },
        newValue: { status: 'resolved', notes: req.body.notes },
      });

      // Notify employee to confirm
      const employee = await User.findById(ticket.employee_id);
      if (employee) notifyTicketResolved({ ticket: updated, employee }).catch(() => {});

      // Update Keka
      if (ticket.keka_ticket_id) {
        keka.updateTicketStatus(ticket.keka_ticket_id, 'resolved').catch(() => {});
      }

      res.json({ ticket: updated, message: 'Employee has been notified to confirm resolution.' });
    } catch (err) { next(err); }
  }
);

// POST /api/tickets/:id/confirm-resolution — employee confirms or rejects
router.post('/:id/confirm-resolution',
  requireAuth,
  body('confirmed').isBoolean(),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.employee_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const { confirmed, rating, comment } = req.body;

      if (confirmed) {
        const updated = await Ticket.update(ticket.id, { status: 'closed', closedAt: new Date() });
        await AuditLog.create({ ticketId: ticket.id, actorId: req.user.id, action: 'closed_by_employee' });

        if (rating) {
          await Feedback.create({ ticketId: ticket.id, userId: req.user.id, rating, comment });
        }
        res.json({ ticket: updated, message: 'Ticket closed. Thank you for your feedback!' });
      } else {
        // Employee rejects — reopen and escalate
        await Ticket.update(ticket.id, { status: 'reopened', resolvedAt: null });
        await AuditLog.create({
          ticketId: ticket.id,
          actorId: req.user.id,
          action: 'reopened',
          newValue: { reason: comment },
        });
        await escalate(ticket.id, `Employee rejected resolution: ${comment || 'no reason given'}`, req.user.id);
        res.json({ message: 'Ticket reopened and escalated. Our team will follow up.' });
      }
    } catch (err) { next(err); }
  }
);

// POST /api/tickets/:id/escalate — manual escalation
router.post('/:id/escalate',
  requireAuth,
  body('reason').notEmpty().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (!canAccess(ticket, req.user)) return res.status(403).json({ error: 'Forbidden' });

      const escalation = await escalate(ticket.id, req.body.reason, req.user.id);
      if (!escalation) return res.status(400).json({ error: 'Already at maximum escalation level' });

      res.json({ escalation, message: 'Ticket escalated successfully.' });
    } catch (err) { next(err); }
  }
);

// POST /api/tickets/:id/feedback
router.post('/:id/feedback',
  requireAuth,
  body('rating').isInt({ min: 1, max: 5 }),
  body('comment').optional().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const ticket = await Ticket.findById(req.params.id);
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
      if (ticket.employee_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const fb = await Feedback.create({
        ticketId: ticket.id,
        userId: req.user.id,
        rating: req.body.rating,
        comment: req.body.comment,
      });

      res.status(201).json({ feedback: fb });
    } catch (err) { next(err); }
  }
);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function canAccess(ticket, user) {
  if (['admin', 'px_lead'].includes(user.role)) return true;
  if (user.role === 'hrbp') return true;  // HRBP can see all; route-level scoping handles assignment
  return ticket.employee_id === user.id && !ticket.is_confidential;
}

function maskConfidential(ticket) {
  return { ...ticket, description: '[Confidential — contact HR]', description_enc: undefined };
}

async function getAuditLog(ticketId) {
  const db = require('../config/database');
  const { rows } = await db.query(
    `SELECT a.*, u.name AS actor_name FROM ticket_audit_log a
     LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.ticket_id = $1 ORDER BY a.created_at ASC`, [ticketId]);
  return rows;
}

module.exports = router;
