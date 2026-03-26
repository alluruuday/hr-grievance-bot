/**
 * Keka HRMS integration service.
 * Wraps Keka API calls with retry logic (NFR-04).
 *
 * Phase 1 scope: ticket creation + routing + TAT tracking.
 * All methods gracefully degrade if Keka is unreachable.
 */

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const logger = require('../utils/logger');

const keka = axios.create({
  baseURL: process.env.KEKA_API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'x-api-key':    process.env.KEKA_API_KEY,
    'x-tenant-id':  process.env.KEKA_TENANT_ID,
  },
});

axiosRetry(keka, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) => axiosRetry.isNetworkOrIdempotentRequestError(err) || (err.response?.status >= 500),
  onRetry: (count, err) => logger.warn('Keka API retry', { count, error: err.message }),
});

/**
 * Create a ticket in Keka HRMS.
 * Returns the keka ticket ID on success, null if Keka is unavailable.
 */
async function createTicket({ employeeId, category, subCategory, description, severity, isConfidential, department }) {
  if (!process.env.KEKA_API_BASE_URL) {
    logger.info('Keka not configured — skipping ticket creation');
    return null;
  }
  try {
    const { data } = await keka.post('/v1/tickets', {
      employee_id:   employeeId,
      category:      category,
      sub_category:  subCategory,
      description:   description,
      priority:      mapSeverityToPriority(severity),
      is_confidential: isConfidential,
      department:    department,
      source:        'grievance_bot',
    });
    logger.info('Keka ticket created', { kekaId: data.id });
    return data.id;
  } catch (err) {
    logger.error('Failed to create Keka ticket', { error: err.message });
    return null;  // Graceful degradation — ticket still stored locally
  }
}

/**
 * Update the status of a Keka ticket.
 */
async function updateTicketStatus(kekaTicketId, status) {
  if (!process.env.KEKA_API_BASE_URL || !kekaTicketId) return;
  try {
    await keka.patch(`/v1/tickets/${kekaTicketId}`, { status });
    logger.info('Keka ticket updated', { kekaTicketId, status });
  } catch (err) {
    logger.warn('Failed to update Keka ticket status', { kekaTicketId, error: err.message });
  }
}

/**
 * Fetch employee info from Keka (used for context enrichment).
 */
async function getEmployee(employeeId) {
  if (!process.env.KEKA_API_BASE_URL) return null;
  try {
    const { data } = await keka.get(`/v1/employees/${employeeId}`);
    return data;
  } catch (err) {
    logger.warn('Failed to fetch employee from Keka', { employeeId, error: err.message });
    return null;
  }
}

function mapSeverityToPriority(severity) {
  const map = { low: 'P4', medium: 'P3', high: 'P2', critical: 'P1' };
  return map[severity] || 'P3';
}

module.exports = { createTicket, updateTicketStatus, getEmployee };
