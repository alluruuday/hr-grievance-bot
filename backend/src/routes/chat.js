/**
 * Chat API — the core conversational flow.
 *
 * POST /api/chat/session          → start a new session
 * POST /api/chat/session/:id/message  → send a message, get AI response
 * POST /api/chat/session/:id/resolve  → mark resolved + capture feedback
 * POST /api/chat/session/:id/ticket   → create ticket from session
 * GET  /api/chat/session/:id      → get session + messages
 * GET  /api/chat/categories       → list all categories
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const { requireAuth } = require('../middleware/auth');
const { ChatSession, ChatMessage, Category, KnowledgeBase, Ticket, Feedback, AuditLog } = require('../models');
const llm = require('../services/llm');
const keka = require('../services/keka');
const { notifyTicketCreated } = require('../services/notifications');
const { Ticket: TicketModel, User } = require('../models');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/chat/categories
router.get('/categories', requireAuth, async (req, res, next) => {
  try {
    const cats = await Category.list();
    res.json({ categories: cats });
  } catch (err) { next(err); }
});

// POST /api/chat/session — start a new session
router.post('/session', requireAuth, async (req, res, next) => {
  try {
    const session = await ChatSession.create({ userId: req.user.id });

    // Initial greeting message
    const greeting = `Hi ${req.user.name}! 👋 I'm your HR assistant. How can I help you today?\n\nYou can ask me about:\n• Leave & Attendance\n• Payroll & Salary\n• HRMS / Documents\n• Policies\n• Performance & Growth\n• Workplace concerns\n\nWhat's on your mind?`;
    await ChatMessage.create({ sessionId: session.id, role: 'assistant', content: greeting });

    res.status(201).json({ session, greeting });
  } catch (err) { next(err); }
});

// GET /api/chat/session/:id
router.get('/session/:id', requireAuth, async (req, res, next) => {
  try {
    const session = await ChatSession.findById(req.params.id);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.user_id !== req.user.id && !['hrbp','px_lead','admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const messages = await ChatMessage.listBySession(session.id);
    res.json({ session, messages });
  } catch (err) { next(err); }
});

// POST /api/chat/session/:id/message — the main chat turn
router.post('/session/:id/message',
  requireAuth,
  body('content').notEmpty().trim().isLength({ max: 2000 }),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const session = await ChatSession.findById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });
      if (session.status !== 'active') return res.status(400).json({ error: 'Session is no longer active' });

      const { content } = req.body;

      // Save user message
      await ChatMessage.create({ sessionId: session.id, role: 'user', content });

      // Load history for context
      const history = await ChatMessage.listBySession(session.id);

      // 1. Classify intent
      const intent = await llm.classifyIntent(content,
        history.slice(-6).map(m => ({ role: m.role, content: m.content }))
      );
      logger.debug('Intent classified', { intent });

      // Resolve category from DB if found
      let category = null;
      let subCategory = null;
      if (intent.categorySlug) {
        category = await Category.findBySlug(intent.categorySlug);
        if (category) {
          await ChatSession.update(session.id, { categoryId: category.id });
        }
      }

      // 2. KB search
      const kbSnippets = await KnowledgeBase.search({
        categoryId: category?.id || session.category_id,
        subCategoryId: session.sub_category_id,
        keywords: intent.keywords || [],
      });

      // 3. Generate response
      const { text, suggestTicket } = await llm.generateResponse({
        userMessage: content,
        conversationHistory: history.slice(-10).map(m => ({ role: m.role, content: m.content })),
        kbSnippets,
        category: category?.name,
        subCategory: subCategory?.name,
        userName: req.user.name,
      });

      // Save assistant message
      await ChatMessage.create({
        sessionId: session.id,
        role: 'assistant',
        content: text,
        metadata: { intent, kbSnippetsCount: kbSnippets.length, suggestTicket },
      });

      res.json({
        message: text,
        intent,
        kbSnippets: kbSnippets.map(s => ({ title: s.title, policyUrl: s.policy_url })),
        suggestTicket,
      });
    } catch (err) { next(err); }
  }
);

// POST /api/chat/session/:id/resolve — employee confirms resolution
router.post('/session/:id/resolve',
  requireAuth,
  body('resolved').isBoolean(),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const session = await ChatSession.findById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const { resolved, rating, comment } = req.body;

      if (resolved) {
        await ChatSession.update(session.id, { status: 'resolved', resolvedVia: 'kb' });

        if (rating) {
          await Feedback.create({ sessionId: session.id, userId: req.user.id, rating, comment });
        }
        res.json({ message: 'Great! Glad I could help. Your feedback has been recorded.' });
      } else {
        // Not resolved — prompt for ticket
        res.json({
          message: 'I understand. Let me raise a support ticket for you so our HR team can look into this personally.',
          nextAction: 'create_ticket',
        });
      }
    } catch (err) { next(err); }
  }
);

// POST /api/chat/session/:id/ticket — create ticket from session
router.post('/session/:id/ticket',
  requireAuth,
  body('description').optional().trim(),
  body('severity').optional().isIn(['low', 'medium', 'high', 'critical']),
  async (req, res, next) => {
    try {
      const session = await ChatSession.findById(req.params.id);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

      const history = await ChatMessage.listBySession(session.id);
      const category = session.category_id ? await Category.findById(session.category_id) : null;

      // Auto-extract fields if not provided
      let { description, severity, department, managerName } = req.body;
      if (!description) {
        const extracted = await llm.extractTicketFields(
          history.map(m => ({ role: m.role, content: m.content })),
          category?.name
        );
        description = extracted.description;
        severity = severity || extracted.severity;
        department = department || extracted.department;
        managerName = managerName || extracted.managerName;
      }

      const employee = await User.findById(req.user.id);
      const isConfidential = category?.slug === 'sensitive-confidential';

      // Compute due_at based on SLA
      const dueAt = computeDueAt(category, severity || 'medium');

      // Find HRBP to assign
      const hrbpUsers = await User.listByRole('hrbp');
      const assignedTo = hrbpUsers[0]?.id || null;

      const ticket = await TicketModel.create({
        sessionId: session.id,
        employeeId: req.user.id,
        categoryId: session.category_id,
        subCategoryId: session.sub_category_id,
        description,
        severity: severity || 'medium',
        isConfidential,
        department: department || employee?.department,
        managerName,
        assignedTo,
        dueAt,
      });

      // Update session status
      await ChatSession.update(session.id, { status: 'escalated', resolvedVia: 'ticket' });

      // Audit log
      await AuditLog.create({
        ticketId: ticket.id,
        actorId: req.user.id,
        action: 'created',
        newValue: { status: 'open', severity, isConfidential },
      });

      // Push to Keka (async, non-blocking)
      keka.createTicket({
        employeeId: employee?.employee_id,
        category: category?.name,
        subCategory: session.sub_category_id,
        description,
        severity: severity || 'medium',
        isConfidential,
        department: department || employee?.department,
      }).then(kekaId => {
        if (kekaId) TicketModel.update(ticket.id, { kekaTicketId: kekaId });
      }).catch(() => {});

      // Notify employee
      if (employee) {
        const ticketWithCategory = { ...ticket, category_name: category?.name };
        notifyTicketCreated({ ticket: ticketWithCategory, employee }).catch(() => {});
      }

      res.status(201).json({
        ticket: { ...ticket, category_name: category?.name },
        message: `Ticket #${ticket.ticket_number} has been created. Our HR team will get back to you within ${formatSLA(category, severity || 'medium')}.`,
      });
    } catch (err) { next(err); }
  }
);

function computeDueAt(category, severity) {
  if (!category) return null;
  const now = new Date();
  if (severity === 'critical') {
    return new Date(now.getTime() + (category.sla_critical_hours || 4) * 3600 * 1000);
  }
  const days = severity === 'high'   ? (category.sla_high_days || 1)
             : severity === 'medium' ? (category.sla_medium_days || 3)
             :                          (category.sla_low_days || 5);
  return new Date(now.getTime() + days * 24 * 3600 * 1000);
}

function formatSLA(category, severity) {
  if (!category) return 'the standard SLA';
  if (severity === 'critical') return `${category.sla_critical_hours} hours`;
  const days = severity === 'high' ? category.sla_high_days : severity === 'medium' ? category.sla_medium_days : category.sla_low_days;
  return `${days} business day${days > 1 ? 's' : ''}`;
}

module.exports = router;
