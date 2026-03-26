/**
 * Knowledge Base API (FR-19, FR-20, FR-21)
 *
 * GET  /api/knowledge          → list KB entries (any authenticated user)
 * GET  /api/knowledge/:id      → single entry + signed download URL
 * POST /api/knowledge          → create entry with optional file upload (HRBP+)
 * PATCH /api/knowledge/:id     → update entry (HRBP+)
 * DELETE /api/knowledge/:id    → soft-delete (HRBP+)
 * GET  /api/knowledge/:id/download → get signed URL for file
 */

const express = require('express');
const multer  = require('multer');
const { body, validationResult } = require('express-validator');
const { requireAuth, requireMinRole } = require('../middleware/auth');
const { KnowledgeBase, Category } = require('../models');
const spaces = require('../services/spaces');
const logger = require('../utils/logger');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB
});

// GET /api/knowledge
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { categoryId, page = 1, limit = 20 } = req.query;
    const entries = await KnowledgeBase.list({ categoryId, page: parseInt(page), limit: parseInt(limit) });
    res.json({ entries });
  } catch (err) { next(err); }
});

// GET /api/knowledge/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const db = require('../config/database');
    const { rows } = await db.query(
      `SELECT kb.*, c.name AS category_name, sc.name AS sub_category_name
       FROM knowledge_base kb
       LEFT JOIN categories c ON c.id = kb.category_id
       LEFT JOIN sub_categories sc ON sc.id = kb.sub_category_id
       WHERE kb.id = $1 AND kb.is_active = TRUE`, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json({ entry: rows[0] });
  } catch (err) { next(err); }
});

// GET /api/knowledge/:id/download — signed URL
router.get('/:id/download', requireAuth, async (req, res, next) => {
  try {
    const db = require('../config/database');
    const { rows } = await db.query(`SELECT file_key FROM knowledge_base WHERE id = $1`, [req.params.id]);
    if (!rows[0] || !rows[0].file_key) return res.status(404).json({ error: 'No file attached' });
    const url = await spaces.getSignedDownloadUrl(rows[0].file_key);
    res.json({ url, expiresIn: 3600 });
  } catch (err) { next(err); }
});

// POST /api/knowledge — create entry
router.post('/',
  requireAuth, requireMinRole('hrbp'),
  upload.single('file'),
  body('title').notEmpty().trim(),
  body('content').notEmpty().trim(),
  body('categoryId').isUUID(),
  body('subCategoryId').optional().isUUID(),
  body('keywords').optional(),
  body('policyUrl').optional().trim(),
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { title, content, categoryId, subCategoryId, keywords, policyUrl } = req.body;
      let fileKey = null;

      if (req.file) {
        const category = await Category.findById(categoryId);
        const result = await spaces.uploadFile({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          uploadedBy: req.user.id,
          categorySlug: category?.slug,
        });
        fileKey = result.key;
      }

      const parsedKeywords = typeof keywords === 'string'
        ? keywords.split(',').map(k => k.trim()).filter(Boolean)
        : (Array.isArray(keywords) ? keywords : []);

      const entry = await KnowledgeBase.create({
        categoryId,
        subCategoryId: subCategoryId || null,
        title,
        content,
        keywords: parsedKeywords,
        policyUrl: policyUrl || null,
        fileKey,
        uploadedBy: req.user.id,
      });

      res.status(201).json({ entry });
    } catch (err) { next(err); }
  }
);

// PATCH /api/knowledge/:id
router.patch('/:id',
  requireAuth, requireMinRole('hrbp'),
  upload.single('file'),
  async (req, res, next) => {
    try {
      const { title, content, keywords, policyUrl, isActive } = req.body;
      const updates = {};
      if (title !== undefined)     updates.title     = title;
      if (content !== undefined)   updates.content   = content;
      if (policyUrl !== undefined) updates.policyUrl = policyUrl;
      if (isActive !== undefined)  updates.isActive  = isActive === 'true' || isActive === true;

      if (keywords !== undefined) {
        updates.keywords = typeof keywords === 'string'
          ? keywords.split(',').map(k => k.trim()).filter(Boolean)
          : keywords;
      }

      if (req.file) {
        // Get old key to delete
        const db = require('../config/database');
        const { rows } = await db.query(`SELECT file_key, category_id FROM knowledge_base WHERE id = $1`, [req.params.id]);
        if (rows[0]?.file_key) spaces.deleteFile(rows[0].file_key).catch(() => {});

        const category = rows[0]?.category_id ? await Category.findById(rows[0].category_id) : null;
        const result = await spaces.uploadFile({
          buffer: req.file.buffer,
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          uploadedBy: req.user.id,
          categorySlug: category?.slug,
        });
        updates.fileKey = result.key;
      }

      const entry = await KnowledgeBase.update(req.params.id, updates);
      if (!entry) return res.status(404).json({ error: 'Not found' });
      res.json({ entry });
    } catch (err) { next(err); }
  }
);

// DELETE /api/knowledge/:id — soft delete
router.delete('/:id', requireAuth, requireMinRole('hrbp'), async (req, res, next) => {
  try {
    await KnowledgeBase.update(req.params.id, { isActive: false });
    res.json({ message: 'Entry removed from knowledge base.' });
  } catch (err) { next(err); }
});

module.exports = router;
