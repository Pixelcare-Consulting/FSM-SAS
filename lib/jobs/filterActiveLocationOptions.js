/**
 * Filter job-form location options so Inactive customer_address_details sites
 * are hidden from Create/Edit Job pickers. Missing status is treated as Active.
 */

function normalizeKeepSiteIds(keepSiteIds) {
  const raw = Array.isArray(keepSiteIds)
    ? keepSiteIds
    : keepSiteIds != null && keepSiteIds !== ''
      ? [keepSiteIds]
      : [];
  const out = [];
  const seen = new Set();
  for (const id of raw) {
    const key = String(id ?? '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** @param {unknown} status */
export function normalizeLocationOptionStatus(status) {
  const s = String(status ?? 'Active').trim();
  return s || 'Active';
}

/** True when status is missing or anything other than Inactive. */
export function isLocationOptionActive(option) {
  return normalizeLocationOptionStatus(option?.status).toLowerCase() !== 'inactive';
}

/** Identity keys used to match keepSiteIds (Edit Job current site). */
export function locationOptionIdentityKeys(option) {
  if (!option || typeof option !== 'object') return [];
  const keys = [
    option.siteId,
    option.value,
    option.portalLocationId,
    option.PortalLocationId,
    option.address,
    option.locationName,
  ];
  const out = [];
  const seen = new Set();
  for (const key of keys) {
    const t = String(key ?? '').trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

function isKeptInactiveOption(option, keepSet) {
  if (keepSet.size === 0) return false;
  return locationOptionIdentityKeys(option).some((key) => keepSet.has(key));
}

function decorateKeptInactiveOption(option) {
  if (isLocationOptionActive(option)) return option;
  return {
    ...option,
    status: 'Inactive',
    isDisabled: true,
  };
}

function filterFlatLocationOptions(options, keepSet) {
  return options
    .filter((option) => {
      if (!option) return false;
      if (isLocationOptionActive(option)) return true;
      return isKeptInactiveOption(option, keepSet);
    })
    .map(decorateKeptInactiveOption);
}

/**
 * Drop Inactive location options from a flat or grouped react-select list.
 * @param {Array} options - flat options or `{ label, options }[]` groups
 * @param {{ keepSiteIds?: string|string[] }} [opts]
 */
export function filterActiveLocationOptions(options = [], { keepSiteIds } = {}) {
  if (!Array.isArray(options) || options.length === 0) return [];

  const keepSet = new Set(normalizeKeepSiteIds(keepSiteIds));

  if (options[0]?.options) {
    return options
      .map((group) => ({
        ...group,
        options: filterFlatLocationOptions(
          Array.isArray(group.options) ? group.options : [],
          keepSet
        ),
      }))
      .filter((group) => (group.options?.length || 0) > 0);
  }

  return filterFlatLocationOptions(options, keepSet);
}
