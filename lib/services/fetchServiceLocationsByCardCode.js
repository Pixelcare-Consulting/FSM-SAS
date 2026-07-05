/**
 * Format address from sapService.getBusinessPartnerAddresses structure.
 */
function formatBpAddress(addr) {
  const parts = [
    addr?.Street,
    addr?.Block,
    addr?.Building,
    addr?.Address2,
    addr?.Address3,
    addr?.City,
    addr?.State,
    addr?.County,
    addr?.ZipCode,
    addr?.CountryName || addr?.Country,
  ].filter(Boolean);
  return parts.join(", ") || (addr?.AddressName || "Address from SAP");
}

/**
 * Fetch service locations (addresses) for a Business Partner from SAP B1 by CardCode (BP Code).
 * Uses BusinessPartners API with BPAddresses expansion first, then sapService SQL fallback.
 * @param {string} cardCode - SAP CardCode (BP/customer code)
 * @param {{ b1session: string, routeid: string }} sessionCookies - Session cookies
 * @returns {Promise<Array<{ Address1, Address2, Address3, PostalCode, Country, ... }>>}
 */
export async function fetchServiceLocationsByCardCode(cardCode, sessionCookies) {
  if (!cardCode || !sessionCookies?.b1session || !sessionCookies?.routeid) {
    return [];
  }

  const cleanCardCode = String(cardCode).trim();
  if (!cleanCardCode) return [];

  const baseUrl = (process.env.SAP_SERVICE_LAYER_BASE_URL || "").trim().replace(/\/$/, "") + "/";

  // 1. Try BusinessPartners API with BPAddresses expansion (native OData - most reliable)
  try {
    const bpUrl = `${baseUrl}BusinessPartners('${encodeURIComponent(cleanCardCode)}')?$expand=BPAddresses`;
    const response = await fetch(bpUrl, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Cookie: `B1SESSION=${sessionCookies.b1session}; ROUTEID=${sessionCookies.routeid}`,
      },
    });

    if (response.ok) {
      const bp = await response.json();
      const addresses = bp?.BPAddresses || [];
      if (addresses.length > 0) {
        // Prefer ShipTo (AdresType='bo_ShipTo'), then BillTo
        const sorted = [...addresses].sort((a, b) => {
          const aShip = (a.AddressType || "").includes("ShipTo") ? 0 : 1;
          const bShip = (b.AddressType || "").includes("ShipTo") ? 0 : 1;
          return aShip - bShip;
        });
        return sorted.map((addr) => ({
          Address1: [addr.Street, addr.Block, addr.Building].filter(Boolean).join(", ") || addr.AddressName,
          Address2: addr.Address2 || "",
          Address3: addr.Address3 || "",
          PostalCode: addr.ZipCode || "",
          Country: addr.CountryName || addr.Country || "",
          _formatted: formatBpAddress(addr),
        }));
      }
    }
  } catch (err) {
    console.warn("[fetchServiceLocationsByCardCode] BPAddresses expand failed:", err?.message);
  }

  // 2. Fallback: sapService.getBusinessPartnerAddresses (SQL query via CRD1)
  try {
    const sapService = (await import("./sapService.js")).default;
    const addresses = await sapService.getBusinessPartnerAddresses(cleanCardCode, sessionCookies);
    if (addresses && addresses.length > 0) {
      return addresses.map((addr) => ({
        Address1: [addr.Street, addr.Block, addr.Building].filter(Boolean).join(", ") || addr.AddressName,
        Address2: addr.Address2 || "",
        Address3: addr.Address3 || "",
        PostalCode: addr.ZipCode || "",
        Country: addr.CountryName || addr.Country || "",
        _formatted: formatBpAddress(addr),
      }));
    }
  } catch (err) {
    console.warn("[fetchServiceLocationsByCardCode] getBusinessPartnerAddresses failed:", err?.message);
  }

  return [];
}
