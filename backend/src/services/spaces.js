/**
 * DigitalOcean Spaces service (S3-compatible via AWS SDK v3).
 * Used for HR policy document uploads from the admin panel.
 */

const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const logger = require('../utils/logger');

const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region:   process.env.DO_SPACES_REGION || 'nyc3',
  credentials: {
    accessKeyId:     process.env.DO_SPACES_KEY,
    secretAccessKey: process.env.DO_SPACES_SECRET,
  },
  forcePathStyle: false,
});

const BUCKET = process.env.DO_SPACES_BUCKET || 'hr-grievance-docs';
const ALLOWED_TYPES = ['application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain', 'image/png', 'image/jpeg'];

/**
 * Upload a file buffer to Spaces.
 * @returns { key, url } — key is the Spaces object key, url is the public CDN URL
 */
async function uploadFile({ buffer, originalName, mimeType, uploadedBy, categorySlug }) {
  if (!ALLOWED_TYPES.includes(mimeType)) {
    const err = new Error(`File type not allowed: ${mimeType}`);
    err.status = 400;
    throw err;
  }

  const ext = path.extname(originalName) || '';
  const key = `policies/${categorySlug || 'general'}/${uuidv4()}${ext}`;

  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        buffer,
    ContentType: mimeType,
    ACL:         'private',   // private — serve via signed URLs
    Metadata: {
      originalName,
      uploadedBy: uploadedBy || 'unknown',
    },
  }));

  logger.info('File uploaded to Spaces', { key, size: buffer.length });
  return { key };
}

/**
 * Generate a short-lived pre-signed URL for a private document.
 */
async function getSignedDownloadUrl(key, expiresInSeconds = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  const url = await getSignedUrl(s3, command, { expiresIn: expiresInSeconds });
  return url;
}

/**
 * Delete a document from Spaces.
 */
async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  logger.info('File deleted from Spaces', { key });
}

module.exports = { uploadFile, getSignedDownloadUrl, deleteFile };
