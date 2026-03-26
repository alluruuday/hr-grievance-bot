const logger = require('../utils/logger');

function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error ${err.message}`, {
    method: req.method,
    url: req.url,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.code === '23505') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referenced resource not found' });
  }

  // Anthropic / external API auth errors must never bubble up as 401
  // (that would log the user out of the app)
  if (err.status === 401 && err.error?.type === 'authentication_error') {
    return res.status(502).json({ error: 'AI service is not configured correctly. Please contact your admin.' });
  }

  const status = err.status || err.statusCode || 500;
  // Never forward 401 from external services as-is
  const safeStatus = status === 401 && !res.headersSent ? 502 : status;
  const message = safeStatus < 500 ? err.message : 'Internal server error';
  res.status(safeStatus).json({ error: message });
}

module.exports = errorHandler;
