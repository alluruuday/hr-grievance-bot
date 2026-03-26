/**
 * Notification service — email (+ optional Slack Phase 2).
 */

const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

let transporter = null;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    logger.info('SMTP not configured — skipping email', { to, subject });
    return;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.EMAIL_FROM || 'HR Bot <hr-bot@company.com>',
      to,
      subject,
      html,
    });
    logger.info('Email sent', { to, subject });
  } catch (err) {
    logger.error('Failed to send email', { to, error: err.message });
  }
}

async function notifyTicketCreated({ ticket, employee }) {
  await sendEmail({
    to: employee.email,
    subject: `[Ticket #${ticket.ticket_number}] Your HR query has been received`,
    html: `
      <p>Hi ${employee.name},</p>
      <p>Your HR support ticket has been created successfully.</p>
      <table style="border-collapse:collapse">
        <tr><td><b>Ticket #</b></td><td>${ticket.ticket_number}</td></tr>
        <tr><td><b>Category</b></td><td>${ticket.category_name || ticket.category_id}</td></tr>
        <tr><td><b>Severity</b></td><td>${ticket.severity}</td></tr>
        <tr><td><b>Status</b></td><td>${ticket.status}</td></tr>
      </table>
      <p>We will get back to you within the SLA. You'll be notified on updates.</p>
      <p>Regards,<br>HR Team</p>
    `,
  });
}

async function notifyTicketResolved({ ticket, employee }) {
  await sendEmail({
    to: employee.email,
    subject: `[Ticket #${ticket.ticket_number}] Your ticket has been resolved — please confirm`,
    html: `
      <p>Hi ${employee.name},</p>
      <p>Your HR ticket <b>#${ticket.ticket_number}</b> has been marked as resolved by our team.</p>
      <p>Please log in to confirm resolution or reopen if your issue persists.</p>
      <p>Regards,<br>HR Team</p>
    `,
  });
}

async function notifyEscalation({ ticket, toEmail, toName, level }) {
  await sendEmail({
    to: toEmail,
    subject: `[ESCALATED] Ticket #${ticket.ticket_number} — ${ticket.category_name}`,
    html: `
      <p>Hi ${toName},</p>
      <p>Ticket <b>#${ticket.ticket_number}</b> has been escalated to your level (${level}).</p>
      <table style="border-collapse:collapse">
        <tr><td><b>Category</b></td><td>${ticket.category_name}</td></tr>
        <tr><td><b>Severity</b></td><td>${ticket.severity}</td></tr>
        <tr><td><b>Open since</b></td><td>${new Date(ticket.created_at).toLocaleDateString()}</td></tr>
      </table>
      <p>Please take action immediately.</p>
      <p>Regards,<br>HR Bot</p>
    `,
  });
}

async function notifyTATReminder({ ticket, assigneeEmail, assigneeName, pct }) {
  await sendEmail({
    to: assigneeEmail,
    subject: `[REMINDER] Ticket #${ticket.ticket_number} is at ${pct}% of SLA`,
    html: `
      <p>Hi ${assigneeName},</p>
      <p>Ticket <b>#${ticket.ticket_number}</b> (${ticket.category_name}) has reached ${pct}% of its SLA.</p>
      <p>Due: ${ticket.due_at ? new Date(ticket.due_at).toLocaleString() : 'N/A'}</p>
      <p>Please update the ticket status promptly.</p>
      <p>Regards,<br>HR Bot</p>
    `,
  });
}

module.exports = { sendEmail, notifyTicketCreated, notifyTicketResolved, notifyEscalation, notifyTATReminder };
