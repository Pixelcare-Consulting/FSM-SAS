/**
 * Shared OData $filter pieces for BusinessPartners address search.
 * - Drops tiny / stop-word tokens so e.g. "the" (vs SAP's "THE") does not break AND logic.
 * - Optional {@link buildBPAddressesAnyClause}: matches when Ship-To lives only in BPAddresses
 *   (header Street/Building often empty in Service Layer for some leads).
 *
 * @param {string} str
 * @param {(s: string) => string} escapeODataString
 */

/** Tokens ignored for OData `contains` address matching (case-insensitive) */
const ADDRESS_STOP_TOKENS = new Set([
  'a',
  'an',
  'and',
  'at',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'for',
  'no',
  'sg'
]);

/**
 * @param {string} rawSearch
 * @returns {string[]}
 */
export function getMeaningfulAddressSearchTokens(rawSearch) {
  return String(rawSearch)
    .trim()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .filter((t) => t.length > 1 || /^[#\d]/.test(t)) // keep "#", "1" is dropped
    .filter((t) => !ADDRESS_STOP_TOKENS.has(t.toLowerCase()));
}

/** "#17-06" and "17-06" for OData contains (SAP often omits # on Street/Building) */
function tokenVariantsForODataContains(token) {
  const t = String(token);
  const set = new Set([t]);
  if (t.startsWith('#') && t.length > 2) {
    set.add(t.slice(1));
  }
  return [...set];
}

const BP_HEADER_ADDRESS_FIELDS = [
  'Street',
  'Address',
  'MailAddress',
  'ZipCode',
  'Building',
  'Block',
  'County',
  'City',
  'Country',
  'BillToBuildingFloorRoom'
];

/** Sub-fields on each BPAddress row (Service Layer) */
const BPA_SUB_FIELDS = [
  'Street',
  'AddressName',
  'City',
  'ZipCode',
  'Block',
  'Building',
  'BuildingFloorRoom',
  'County',
  'Country'
];

/**
 * AND of ORs: every token must appear in at least one header address field.
 * @param {string[]} tokens
 * @param {(s: string) => string} escapeODataString
 * @returns {string|null}
 */
export function buildTokenizedHeaderAddressMatch(tokens, escapeODataString) {
  if (!tokens.length) return null;
  return tokens
    .map((token) => {
      const variants = tokenVariantsForODataContains(token);
      const perVariant = variants.map((v) => {
        const esc = escapeODataString(v);
        const perField = BP_HEADER_ADDRESS_FIELDS.map(
          (field) => `contains(${field}, '${esc}')`
        );
        return `(${perField.join(' or ')})`;
      });
      return perVariant.length > 1 ? `(${perVariant.join(' or ')})` : perVariant[0];
    })
    .join(' and ');
}

/**
 * True when one BPAddresses row has every token in some field (same row).
 * @param {string[]} tokens
 * @param {(s: string) => string} escapeODataString
 * @returns {string|null}
 */
export function buildBPAddressesAnyClause(tokens, escapeODataString) {
  if (!tokens.length) return null;
  const perToken = (token) => {
    const variants = tokenVariantsForODataContains(token);
    const variantOrs = variants.map((v) => {
      const esc = escapeODataString(v);
      const inner = BPA_SUB_FIELDS.map(
        (field) => `contains(adr/${field}, '${esc}')`
      );
      return `(${inner.join(' or ')})`;
    });
    const oneToken = variantOrs.length > 1 ? `(${variantOrs.join(' or ')})` : variantOrs[0];
    return oneToken;
  };
  const body = tokens.map(perToken).join(' and ');
  return `BPAddresses/any(adr: ${body})`;
}
