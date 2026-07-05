/** Strip SAP/Forms placeholders ("-", "--") from lead address parts. */
function normalizeLeadLocationPart(value) {
  const s = String(value ?? '').trim();
  if (!s || /^[-–—]+$/.test(s)) return '';
  return s;
}
const normalizeLeadCountry = (country) => {
  const normalized = normalizeLeadLocationPart(country);
  if (!normalized) return "";
  if (normalized.toUpperCase() === "SG") return "Singapore";
  return normalized;
};

export function buildLeadLocationName(lead) {
  if (!lead) return "Main Location";

  const explicitAddress = normalizeLeadLocationPart(lead.address);
  const building = normalizeLeadLocationPart(lead.building);
  const street = normalizeLeadLocationPart(lead.street);
  const postcode = normalizeLeadLocationPart(lead.postcode);
  const country = normalizeLeadCountry(lead.country);
  const block = normalizeLeadLocationPart(lead.block);
  const unit = normalizeLeadLocationPart(lead.unit);

  const structuredAddress = [building, street, country, postcode]
    .filter(Boolean)
    .join(", ");

  const blockUnit = [block, unit].filter(Boolean).join("-");
  const baseAddress = explicitAddress || structuredAddress;

  if (baseAddress && blockUnit) {
    return `${baseAddress}, ${blockUnit}`;
  }

  if (baseAddress) {
    return baseAddress;
  }

  if (blockUnit) {
    return blockUnit;
  }

  return "Main Location";
}

/** Full address string for customer.customer_address and display (prefers lead.address). */
export function getCustomerAddressFromLead(lead) {
  if (!lead) return null;
  const explicit = normalizeLeadLocationPart(lead.address);
  if (explicit) return explicit;
  const built = buildLeadLocationName(lead);
  if (built && built !== "Main Location") return built;
  return null;
}
