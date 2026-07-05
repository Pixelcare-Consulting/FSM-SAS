const path = require('path');

/**
 * Default workbook for:
 *   - pnpm migrate:aifm-masterlist
 *   - pnpm migrate:aifm-sap-leads
 *   - pnpm migrate:aifm-site-contacts-notes
 * Always override with `--file=` when using a different compile (must be the **same** file for
 * masterlist + site-notes so `customer_location.site_id` matches `deriveSiteId` from the sheet).
 */
const DEFAULT_AIFM_MASTERLIST_WORKBOOK = path.join(
  'public',
  'sample-migration',
  'sas_aifm_compiled_new.xlsx',
);

/**
 * Default for `pnpm migrate:aifm-full:latest` only (runs masterlist then site-notes on one path).
 */
const DEFAULT_AIFM_MASTERLIST_LATEST_SUBMITTED_WORKBOOK = path.join(
  'public',
  'sample-migration',
  'sas_aifm_compiled_latest_Submitted_14.05.26_1430pm.xlsx',
);

module.exports = {
  DEFAULT_AIFM_MASTERLIST_WORKBOOK,
  DEFAULT_AIFM_MASTERLIST_LATEST_SUBMITTED_WORKBOOK,
};
