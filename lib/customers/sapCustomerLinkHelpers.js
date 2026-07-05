/**
 * SAP CardCode resolution and tiered email/phone/name fallback lookup for portal customers.
 */

import sapService from '../services/sapService';
import {
  lookupCardCodeByCustomerName,
  lookupCardCodeByLeadNameExact,
} from '../utils/sapCustomerCardCodeLookup';

function escapeODataLiteral(value) {
  return String(value).trim().replace(/'/g, "''");
}

function normalizePhoneDigits(raw) {
  return String(raw || '').replace(/\D/g, '');
}

function emailsMatch(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function phonesMatch(portalDigits, sapDigits) {
  if (!portalDigits || !sapDigits) return false;
  if (portalDigits === sapDigits) return true;
  if (portalDigits.length >= 8 && sapDigits.length >= 8) {
    return portalDigits.slice(-8) === sapDigits.slice(-8);
  }
  return false;
}

function extractSapContact(bp) {
  return {
    email: String(bp?.EmailAddress || '').trim(),
    phone: String(bp?.Phone1 || bp?.Cellular || '').trim(),
  };
}

function getPortalPhoneDigits(customer) {
  return normalizePhoneDigits(customer?.phone_number || customer?.handphone || '');
}

/**
 * After a name-only hit, verify portal email/phone against the SAP Business Partner.
 */
function assessNameContactMatch(customer, bp) {
  const portalEmail = String(customer?.email || '').trim();
  const portalPhone = getPortalPhoneDigits(customer);
  const sapContact = extractSapContact(bp);
  const sapEmail = sapContact.email;
  const sapPhoneDigits = normalizePhoneDigits(sapContact.phone);

  const emailMatch = portalEmail && sapEmail && emailsMatch(portalEmail, sapEmail);
  const phoneMatch = portalPhone && sapPhoneDigits && phonesMatch(portalPhone, sapPhoneDigits);

  const sapContactOut = {
    email: sapEmail || null,
    phone: sapContact.phone || null,
  };

  if (emailMatch || phoneMatch) {
    return {
      contactMismatch: false,
      match: 'name_verified',
      linkConfidence: 'medium',
      sapContact: sapContactOut,
    };
  }

  const emailConflict = portalEmail && sapEmail && !emailsMatch(portalEmail, sapEmail);
  const phoneConflict = portalPhone && sapPhoneDigits && !phonesMatch(portalPhone, sapPhoneDigits);

  if (emailConflict || phoneConflict) {
    return {
      contactMismatch: true,
      match: 'name_conflict',
      linkConfidence: 'low',
      sapContact: sapContactOut,
    };
  }

  return {
    contactMismatch: false,
    match: 'name_verified',
    linkConfidence: 'medium',
    sapContact: sapContactOut,
  };
}

export function getCurrentSapEnvironment() {
  return (process.env.SAP_B1_COMPANY_DB || '').trim() || null;
}

/**
 * Resolve the SAP CardCode to check for a portal customer row.
 */
export function getEffectiveSapCardCode(customer) {
  if (customer?.sap_card_code) {
    return String(customer.sap_card_code).trim() || null;
  }
  const code = customer?.customer_code;
  if (typeof code !== 'string') return null;
  const isOurInternalCP = /^CP\d+$/i.test(code);
  const isLEADCode = code.startsWith('LEAD-');
  if (!isOurInternalCP && !isLEADCode && /^[A-Za-z0-9]{1,15}$/.test(code)) {
    return code;
  }
  return null;
}

/**
 * Try to find an existing SAP Business Partner by email (EmailAddress field).
 */
async function lookupCardCodeByEmail(email, sessionCookies, cardType = 'C') {
  const trimmed = String(email || '').trim();
  if (!trimmed || !trimmed.includes('@')) return null;
  try {
    const escaped = escapeODataLiteral(trimmed);
    const data = await sapService.getBusinessPartners(
      {
        filter: `(EmailAddress eq '${escaped}') and CardType eq '${cardType}'`,
        top: 5,
        select: 'CardCode,CardName,EmailAddress',
        quiet: true,
      },
      sessionCookies
    );
    const rows = data?.value || [];
    if (!rows.length) return null;
    if (rows.length === 1) {
      return { sapCardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'email_exact' };
    }
    const exact = rows.find(
      (r) => String(r.EmailAddress || '').trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (exact) {
      return { sapCardCode: exact.CardCode, cardName: exact.CardName, match: 'email_exact' };
    }
    return { sapCardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'email_ambiguous' };
  } catch {
    return null;
  }
}

/**
 * Try to find an existing SAP Business Partner by phone (Phone1 / Cellular).
 * Uses normalized digits; Singapore numbers match on last 8 digits.
 * Only returns when exactly one row matches.
 */
export async function lookupCardCodeByPhone(phone, sessionCookies, cardType = 'C') {
  const digits = normalizePhoneDigits(phone);
  if (digits.length < 8) return null;

  const searchDigits = digits.slice(-8);

  try {
    const escaped = escapeODataLiteral(searchDigits);
    const data = await sapService.getBusinessPartners(
      {
        filter: `(contains(Phone1, '${escaped}') or contains(Cellular, '${escaped}')) and CardType eq '${cardType}'`,
        top: 20,
        select: 'CardCode,CardName,Phone1,Cellular',
        quiet: true,
      },
      sessionCookies
    );
    const rows = (data?.value || []).filter((r) => {
      const p1 = normalizePhoneDigits(r.Phone1);
      const cell = normalizePhoneDigits(r.Cellular);
      return phonesMatch(digits, p1) || phonesMatch(digits, cell);
    });
    if (rows.length !== 1) return null;
    return { sapCardCode: rows[0].CardCode, cardName: rows[0].CardName, match: 'phone_exact' };
  } catch {
    return null;
  }
}

async function finalizeLinkHit(hit, sessionCookies, extra = {}) {
  const sapCardCode = hit.sapCardCode || hit.cardCode;
  if (!sapCardCode) return null;

  const exists = await sapService.businessPartnerExists(sapCardCode, sessionCookies);
  if (!exists) return null;

  const bp = await sapService.getBusinessPartner(sapCardCode, sessionCookies);
  const sapContact = extractSapContact(bp);

  return {
    sapCardCode,
    cardName: hit.cardName,
    match: hit.match,
    businessPartner: bp,
    contactMismatch: false,
    sapContact: {
      email: sapContact.email || null,
      phone: sapContact.phone || null,
    },
    linkConfidence: hit.match?.includes('ambiguous') ? 'medium' : 'high',
    ...extra,
  };
}

/**
 * Tiered link: email → phone → verified name (C* customers).
 */
export async function tryLinkExistingSapPartner(customer, sessionCookies) {
  if (!customer || !sessionCookies) return null;

  const email = String(customer.email || '').trim();
  if (email) {
    const emailHit = await lookupCardCodeByEmail(email, sessionCookies, 'C');
    if (emailHit?.sapCardCode) {
      return finalizeLinkHit(emailHit, sessionCookies);
    }
  }

  const phone = customer.phone_number || customer.handphone;
  if (phone) {
    const phoneHit = await lookupCardCodeByPhone(phone, sessionCookies, 'C');
    if (phoneHit?.sapCardCode) {
      return finalizeLinkHit(phoneHit, sessionCookies);
    }
  }

  const name = String(customer.customer_name || '').trim();
  if (name.length >= 2) {
    const nameHit = await lookupCardCodeByCustomerName(name, sessionCookies);
    if (nameHit?.cardCode) {
      if (nameHit.match === 'ambiguous') return null;

      const exists = await sapService.businessPartnerExists(nameHit.cardCode, sessionCookies);
      if (!exists) return null;

      const bp = await sapService.getBusinessPartner(nameHit.cardCode, sessionCookies);
      const contact = assessNameContactMatch(customer, bp);

      return {
        sapCardCode: nameHit.cardCode,
        cardName: nameHit.cardName,
        match: contact.match,
        businessPartner: bp,
        contactMismatch: contact.contactMismatch,
        sapContact: contact.sapContact,
        linkConfidence: contact.linkConfidence,
      };
    }
  }

  return null;
}

/**
 * Tiered lead link: email → phone → verified name (L* CardCode).
 */
export async function tryLinkExistingSapLeadPartner(customer, sessionCookies) {
  if (!customer || !sessionCookies) return null;

  const email = String(customer.email || '').trim();
  if (email) {
    const emailHit = await lookupCardCodeByEmail(email, sessionCookies, 'L');
    if (emailHit?.sapCardCode) {
      return finalizeLinkHit(emailHit, sessionCookies);
    }
  }

  const phone = customer.phone_number || customer.handphone;
  if (phone) {
    const phoneHit = await lookupCardCodeByPhone(phone, sessionCookies, 'L');
    if (phoneHit?.sapCardCode) {
      return finalizeLinkHit(phoneHit, sessionCookies);
    }
  }

  const name = String(customer.customer_name || '').trim();
  if (name.length >= 2) {
    const nameHit = await lookupCardCodeByLeadNameExact(name, sessionCookies);
    if (nameHit?.cardCode) {
      if (nameHit.match === 'ambiguous') return null;

      const portalNorm = name.trim().toLowerCase();
      const sapNorm = String(nameHit.cardName || '').trim().toLowerCase();
      if (portalNorm !== sapNorm && nameHit.match !== 'exact') return null;

      const exists = await sapService.businessPartnerExists(nameHit.cardCode, sessionCookies);
      if (!exists) return null;

      const bp = await sapService.getBusinessPartner(nameHit.cardCode, sessionCookies);
      const contact = assessNameContactMatch(customer, bp);

      return {
        sapCardCode: nameHit.cardCode,
        cardName: nameHit.cardName,
        match: contact.match,
        businessPartner: bp,
        contactMismatch: contact.contactMismatch,
        sapContact: contact.sapContact,
        linkConfidence: contact.linkConfidence,
      };
    }
  }

  return null;
}
