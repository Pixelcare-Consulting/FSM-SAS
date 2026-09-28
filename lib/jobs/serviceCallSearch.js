export const SERVICE_CALL_SEARCH_MIN_CHARS = 2;

/** Every typed word must appear in the call's number, subject, description or customer. */
export function serviceCallMatches(option, rawTerm) {
  const tokens = String(rawTerm ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = [
    option?.label,
    option?.serviceCallID,
    option?.subject,
    option?.description,
    option?.customerName,
    option?.customerCode,
  ]
    .filter((v) => v != null && v !== "")
    .join(" ")
    .toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

/** Open SAP service calls across all customers, as service call options. */
export async function searchServiceCalls(rawTerm) {
  const term = String(rawTerm ?? "").trim();
  if (term.length < SERVICE_CALL_SEARCH_MIN_CHARS) return [];

  const response = await fetch("/api/searchServiceCalls", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: term }),
  });
  if (!response.ok) throw new Error(`Service call search failed (${response.status})`);

  const rows = await response.json();
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    value: row.serviceCallID,
    label: `${row.serviceCallID} - ${row.subject || "(no subject)"} (${row.customerCode}${
      row.customerName ? ` ${row.customerName}` : ""
    })`,
    serviceCallID: row.serviceCallID,
    subject: row.subject || "",
    description: row.description || "",
    customerName: row.customerName || "",
    customerCode: row.customerCode,
    fetchedForCardCode: row.customerCode,
    createDate: row.createDate || "",
    createTime: row.createTime || "",
  }));
}

/**
 * SAP customer option for a searched service call: the loaded masterlist entry,
 * or one built in the same shape as /api/customers/sap-masterlist rows.
 */
export function resolveSapCustomerOption(customers, { customerCode, customerName }) {
  const code = String(customerCode || "").trim();
  if (!code) return null;
  const match = (customers || []).find(
    (c) => String(c.cardCode || c.value || "").trim().toUpperCase() === code.toUpperCase()
  );
  if (match) return match;
  return {
    value: code,
    label: `${code} - ${customerName || ""}`,
    cardCode: code,
    cardName: customerName || "",
    customerId: null,
    email: "",
    phone_number: "",
    customer_address: "",
    sap_card_code: null,
  };
}
