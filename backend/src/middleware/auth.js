const jwt = require('jsonwebtoken');
const { User } = require('../models');

const ROLE_HIERARCHY = {
  employee:  1,
  hrbp:      2,
  px_lead:   3,
  admin:     4,
};

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;  // { id, employeeId, role, name }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token expired or invalid' });
  }
}

/**
 * requireRole('hrbp') — user must have hrbp or above
 * requireRole(['hrbp', 'px_lead']) — user must have one of these roles exactly
 */
function requireRole(roles) {
  const allowed = Array.isArray(roles) ? roles : [roles];
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    if (allowed.includes(req.user.role)) return next();
    // Also allow higher roles (admins can do everything)
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const minRequired = Math.min(...allowed.map(r => ROLE_HIERARCHY[r] || 99));
    if (userLevel >= minRequired) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * requireMinRole('hrbp') — must be hrbp or higher
 */
function requireMinRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthenticated' });
    const userLevel = ROLE_HIERARCHY[req.user.role] || 0;
    const required  = ROLE_HIERARCHY[role] || 0;
    if (userLevel >= required) return next();
    return res.status(403).json({ error: 'Insufficient permissions' });
  };
}

/**
 * Confidential ticket guard — only HR/PX/Admin can see is_confidential tickets
 * unless the ticket belongs to the requesting user.
 */
function canViewTicket(ticket, user) {
  if (!ticket.is_confidential) return true;
  if (['hrbp', 'px_lead', 'admin'].includes(user.role)) return true;
  if (ticket.employee_id === user.id) return false; // hide description from owner too? PRD says restrict visibility
  return false;
}

module.exports = { requireAuth, requireRole, requireMinRole, canViewTicket, ROLE_HIERARCHY };
