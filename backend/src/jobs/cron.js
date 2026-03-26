/**
 * Background cron jobs:
 *  - Every 30 min: check TAT reminders (50% and 100% of SLA)
 *  - Every hour:   auto-escalation check
 */

const cron = require('node-cron');
const { Ticket } = require('../models');
const { notifyTATReminder } = require('../services/notifications');
const { runAutoEscalationCheck } = require('../services/escalation');
const logger = require('../utils/logger');

async function runTATReminders() {
  logger.info('Running TAT reminder check');
  try {
    const db = require('../config/database');

    // Tickets where we're at 50% of SLA and haven't sent the reminder
    const { rows: at50 } = await db.query(
      `SELECT t.*, a.name AS assignee_name, a.email AS assignee_email, c.name AS category_name
       FROM tickets t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN users a ON a.id = t.assigned_to
       WHERE t.status NOT IN ('closed','resolved')
         AND t.due_at IS NOT NULL
         AND t.reminder_50_sent = FALSE
         AND NOW() >= t.created_at + (t.due_at - t.created_at) * 0.5`
    );

    for (const ticket of at50) {
      if (ticket.assignee_email) {
        await notifyTATReminder({
          ticket,
          assigneeEmail: ticket.assignee_email,
          assigneeName: ticket.assignee_name,
          pct: 50,
        });
      }
      await Ticket.update(ticket.id, { reminder50Sent: true });
      logger.info('TAT 50% reminder sent', { ticketId: ticket.id });
    }

    // Tickets at 100% of SLA (due now) and haven't sent final reminder
    const { rows: at100 } = await db.query(
      `SELECT t.*, a.name AS assignee_name, a.email AS assignee_email, c.name AS category_name
       FROM tickets t
       JOIN categories c ON c.id = t.category_id
       LEFT JOIN users a ON a.id = t.assigned_to
       WHERE t.status NOT IN ('closed','resolved')
         AND t.due_at IS NOT NULL
         AND t.reminder_100_sent = FALSE
         AND NOW() >= t.due_at`
    );

    for (const ticket of at100) {
      if (ticket.assignee_email) {
        await notifyTATReminder({
          ticket,
          assigneeEmail: ticket.assignee_email,
          assigneeName: ticket.assignee_name,
          pct: 100,
        });
      }
      await Ticket.update(ticket.id, { reminder100Sent: true });
      logger.info('TAT 100% reminder sent', { ticketId: ticket.id });
    }
  } catch (err) {
    logger.error('TAT reminder job failed', { error: err.message });
  }
}

function startCronJobs() {
  // Every 30 minutes
  cron.schedule('*/30 * * * *', runTATReminders);

  // Every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await runAutoEscalationCheck();
    } catch (err) {
      logger.error('Auto-escalation job failed', { error: err.message });
    }
  });

  logger.info('Cron jobs started');
}

module.exports = { startCronJobs };
