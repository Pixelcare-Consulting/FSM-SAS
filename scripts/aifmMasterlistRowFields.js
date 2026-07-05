/**
 * Shared workbook field readers for Mapped AIFM → SAP migrations.
 */

function str(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/** Workbooks may expose column Z as SAP_AddressType or SAP_AdresType; both shape site_id tails. */
function sapAdresType(row) {
  if (!row || typeof row !== 'object') return '';
  return str(row.SAP_AdresType) || str(row.SAP_AddressType);
}

module.exports = {
  str,
  sapAdresType,
};
