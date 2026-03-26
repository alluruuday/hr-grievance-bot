/**
 * Escalation service — handles auto and manual escalation logic (FR-13/14/15).
 *
 * Escalation path: ticket_owner → hrbp → px_lead → leadership
 */

const { Ticket, TicketEscalation, AuditLog, User } = require('../models');
const { notifyEscalation } = require('./notifications');
const logger = require('../utils/logger');

const ESCALATION_PATH = ['ticket_owner', 'hrbp', 'px_lead', 'leadership'];

/**
 * Get the role to escalate to (next in path).
 */
function nextEscalationLevel(currentLevel) {
  const idx = ESCALATION_PATH.indexOf(currentLevel);
  if (idx === -1 || idx === ESCALATION_PATH.length - 1) return null;
  return ESCALATION_PATH[idx + 1];
}

/**
 * Current escalation level of a ticket based on its latest escalation record.
 */
async function currentLevel(ticketId) {
  const escalations = await TicketEscalation.listByTicket(ticketId);
  if (escalations.length === 0) return 'ticket_owner';
  return escalations[escalations.length - 1].to_level;
}

/**
 * Escalate a ticket to the next level.
 *
 * @param ticketId
 * @param reason  — human-readable reason
 * @param actorId — user who triggered (null = auto/system)
 */
async function escalate(ticketId, reason, actorId = null) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

  if (['closed', 'resolved'].includes(ticket.status)) {
    logger.info('Skipping escalation for closed ticket', { ticketId });
    return null;
  }

  const from = await currentLevel(ticketId);
  const to = nextEscalationLevel(from);

  if (!to) {
    logger.info('Ticket already at max escalation level', { ticketId, from });
    return null;
  }

  // Create escalation record
  const escalation = await TicketEscalation.create({ ticketId, fromLevel: from, toLevel: to, reason, escalatedBy: actorId });

  // Update ticket status
  await Ticket.update(ticketId, { status: 'escalated' });

  // Audit log
  await AuditLog.create({
    ticketId,
    actorId,
    action: 'escalated',
    oldValue: { level: from, status: ticket.status },
    newValue: { level: to, status: 'escalated', reason },
  });

  // Notify the team at the new level
  await notifyEscalationLevel({ ticket, toLevel: to });

  logger.info('Ticket escalated', { ticketId, from, to, reason });
  return escalation;
}

async function notifyEscalationLevel({ ticket, toLevel }) {
  let roleToNotify;
  if (toLevel === 'hrbp')       roleToNotify = 'hrbp';
  else if (toLevel === 'px_lead') roleToNotify = 'px_lead';
  else if (toLevel === 'leadership') roleToNotify = 'admin';
  else return;

  const recipients = await User.listByRole(roleToNotify);
  await Promise.allSettled(
    recipients.map(u =>
      notifyEscalation({ ticket, toEmail: u.email, toName: u.name, level: toLevel })
    )
  );
}

/**
 * Auto-escalation rules check (runs via cron).
 * Triggers escalation if:
 *   - TAT breached
 *   - Same employee raised same category 2+ times in 90 days
 *   - Severity is High or Critical and ticket is open > 2 hours
 */
async function runAutoEscalationCheck() {
  logger.info('Running auto-escalation check');

  // 1. TAT breached tickets
  const overdueTickets = await Ticket.findDue({ hoursAhead: 0 });
  for (const ticket of overdueTickets) {
    if (['closed', 'resolved', 'escalated'].includes(ticket.status)) continue;
    logger.info('Auto-escalating overdue ticket', { ticketId: ticket.id, ticketNumber: ticket.ticket_number });
    await escalate(ticket.id, 'TAT breached — auto escalation');
  }

  // 2. High/Critical tickets open > 2 hours without update
  const db = require('../config/database');
  const { rows: urgentTickets } = await db.query(
    `SELECT t.* FROM tickets t
     WHERE t.severity IN ('high','critical')
       AND t.status = 'open'
       AND t.created_at < NOW() - INTERVAL '2 hours'`
  );
  for (const ticket of urgentTickets) {
    await escalate(ticket.id, `High/Critical severity open > 2 hours — auto escalation`);
  }
}

module.exports = { escalate, currentLevel, runAutoEscalationCheck };
