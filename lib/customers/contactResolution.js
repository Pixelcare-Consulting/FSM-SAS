/** @param {{ contactPerson?: string, contactPhone?: string, contactEmail?: string }|null|undefined} row */
export function hasMeaningfulPortalSiteContact(row) {
  if (!row) return false;
  const name = (row.contactPerson || '').trim();
  if (name && name !== '—') return true;
  if ((row.contactPhone || '').trim()) return true;
  if ((row.contactEmail || '').trim()) return true;
  return false;
}

/** @param {{ Name?: string, FirstName?: string, LastName?: string, Phone1?: string, E_Mail?: string }|null|undefined} c */
export function hasMeaningfulSapContact(c) {
  if (!c) return false;
  const n = [c.FirstName, c.LastName].filter(Boolean).join(' ').trim();
  if (n && n !== '—') return true;
  if (c.Name && c.Name !== '—') return true;
  if ((c.Phone1 || '').trim()) return true;
  if ((c.E_Mail || '').trim()) return true;
  return false;
}

/** @param {{ contactPerson?: string, contactPhone?: string, contactEmail?: string }} p */
export function portalSiteContactToSapShape(p) {
  return {
    Name: (p.contactPerson || '').trim() || '—',
    FirstName: '',
    LastName: '',
    Phone1: (p.contactPhone || '').trim(),
    Active: 'tYES',
    E_Mail: (p.contactEmail || '').trim(),
  };
}

/** @param {Record<string, unknown>|null|undefined} partner */
export function partnerHasMeaningfulContacts(partner) {
  const addrs = Array.isArray(partner?.BPAddresses) ? partner.BPAddresses : [];
  for (const loc of addrs) {
    const portalList = Array.isArray(loc.PortalSiteContacts) ? loc.PortalSiteContacts : [];
    if (portalList.some(hasMeaningfulPortalSiteContact)) return true;
    if (hasMeaningfulSapContact(loc.LocationContact)) return true;
  }
  const employees = Array.isArray(partner?.ContactEmployees) ? partner.ContactEmployees : [];
  return employees.some(hasMeaningfulSapContact);
}

/**
 * When masterlist partner has no contacts, merge SAP ContactEmployees (same card code).
 * @param {Record<string, unknown>} partner
 * @param {string} cardCode
 */
export async function enrichPartnerWithSapContacts(partner, cardCode) {
  if (!partner || partnerHasMeaningfulContacts(partner)) return partner;

  try {
    const res = await fetch(`/api/getCustomerCode?cardCode=${encodeURIComponent(cardCode)}`);
    if (!res.ok) return partner;
    const sap = await res.json();
    const employees = Array.isArray(sap.ContactEmployees)
      ? sap.ContactEmployees.filter((c) => c.Active === 'tYES' || !c.Active)
      : [];
    if (employees.length === 0) return partner;
    return { ...partner, ContactEmployees: employees };
  } catch {
    return partner;
  }
}
