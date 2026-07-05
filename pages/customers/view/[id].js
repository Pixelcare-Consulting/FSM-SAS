/**
 * Canonical friendly URL for customer detail. Reuses the dashboard page implementation.
 * Without this file, /customers/view/:id relies only on next.config.js rewrites; when those
 * do not apply, Next serves 404 even though pages/dashboard/customers/[id].js exists.
 */
export { default } from '../../dashboard/customers/[id]';
