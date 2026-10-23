/** Request body limit for ordinary JSON forms, filters and actions. */
export const DEFAULT_BODY_LIMIT = 1024 * 1024;

/**
 * Routes that receive base64 files (images, documents, the logo, a backup to
 * restore) or Excel import rows; base64 adds about a third to the file size.
 */
export const UPLOAD_BODY_LIMIT = 50 * 1024 * 1024;

/**
 * Rows in one Excel import. A commit is one transaction holding the
 * properties code lock, so other new listings wait for it; at this size it
 * takes about a second (docs/PERFORMANCE.md, "Excel import and N+1 queries").
 */
export const MAX_IMPORT_ROWS = 5000;
