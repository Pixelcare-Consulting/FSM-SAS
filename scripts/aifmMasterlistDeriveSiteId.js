/**
 * Canonical site_id / address_name string for AIFM masterlist imports + notes patchers.
 *
 * Excel rows are interpreted with SAP-style middots first, then folded for DB storage via
 * `commaSapSeparatorStyle` (drops ` · S · ` / ` · B · ` and stray trailing ` · S` / ` · B`).
 */

'use strict';

const { str, sapAdresType } = require('./aifmMasterlistRowFields');
const { commaSapSeparatorStyle } = require('./aifmCustomerLocationLookup');

/** Dotted interim key only (avoid for new writes unless comparing to legacy DB). */
function deriveSiteIdDotted(row) {
  const at = sapAdresType(row);
  const zRaw = str(row.SAP_ZipCode) || str(row.SAP_Zip) || str(row.AIFM_LOC_Zip);
  const tailParts = [at, zRaw].filter(Boolean);
  const stableTail = tailParts.length ? ` · ${tailParts.join(' · ')}` : '';

  const nick = str(row.AIFM_LOC_NickName);
  if (nick) {
    return nick + stableTail;
  }

  const sapParts = [str(row.SAP_Building), str(row.SAP_Street), zRaw, at].filter(Boolean);
  if (sapParts.length) return sapParts.join(' · ');

  const aifmLocParts = [
    str(row.AIFM_LOC_FlatNo),
    str(row.AIFM_LOC_StreetAddr),
    zRaw || str(row.AIFM_LOC_Zip),
    str(row.AIFM_LOC_City),
    at,
  ].filter(Boolean);
  if (aifmLocParts.length) return aifmLocParts.join(' · ');

  return null;
}

/** Use this for inserts/updates — matches importer + AH–AQ join keys. */
function deriveSiteId(row) {
  const dotted = deriveSiteIdDotted(row);
  return dotted ? commaSapSeparatorStyle(dotted) : null;
}

module.exports = { deriveSiteId, deriveSiteIdDotted };
