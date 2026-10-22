/** Request body limit for ordinary JSON forms, filters and actions. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Routes that receive base64 files (images, documents, the logo, a backup to
 * restore) or Excel import rows; base64 adds about a third to the file size.
 */
export const UPLOAD_BODY_LIMIT = 50 * 1024 * 1024;
