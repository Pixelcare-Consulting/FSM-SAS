/**
 * PATCH — update public.sap_lead by lead_code and upsert sap_lead_contact
 * (lead-level when body.sap_lead_location_id is omitted, or scoped to a site when set).
 */

import { getSupabaseAdmin } from '../../../../lib/supabase/server';
import {
  writeAuditLogFromRequest,
  AUDIT_ACTIONS,
  AUDIT_CATEGORIES,
  AUDIT_STATUS,
  buildChanges,
} from '../../../../lib/services/auditLog';

function jsonBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return req.body || {};
}

function splitPersonName(full) {
  const s = String(full || '').trim();
  if (!s) return { first_name: '-', last_name: '-' };
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first_name: parts[0], last_name: '-' };
  return { first_name: parts[0], last_name: parts.slice(1).join(' ') || '-' };
}

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const raw = req.query.leadCode;
  const leadCode = raw ? String(raw).trim() : '';
  if (!leadCode) {
    return res.status(400).json({ success: false, error: 'leadCode required' });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch {
    return res.status(503).json({ success: false, error: 'Database unavailable' });
  }

  const body = jsonBody(req);

  const rawLocId =
    body.sap_lead_location_id != null && String(body.sap_lead_location_id).trim() !== ''
      ? String(body.sap_lead_location_id).trim()
      : null;

  const { data: lead, error: findErr } = await supabase
    .from('sap_lead')
    .select('id, lead_code, lead_name, phone_number, email, lead_address')
    .eq('lead_code', leadCode)
    .is('deleted_at', null)
    .maybeSingle();

  if (findErr) {
    console.error('masterlist lead find:', findErr);
    return res.status(500).json({ success: false, error: findErr.message });
  }
  if (!lead?.id) {
    return res.status(404).json({ success: false, error: 'SAP lead not found in masterlist' });
  }

  if (rawLocId) {
    const { data: locRow, error: locErr } = await supabase
      .from('sap_lead_location')
      .select('id')
      .eq('id', rawLocId)
      .eq('sap_lead_id', lead.id)
      .maybeSingle();
    if (locErr) {
      console.error('masterlist lead location verify:', locErr);
      return res.status(500).json({ success: false, error: locErr.message });
    }
    if (!locRow) {
      return res.status(400).json({
        success: false,
        error: 'sap_lead_location_id is invalid or does not belong to this lead',
      });
    }
  }

  const rawDeleteContactId =
    body.delete_contact_id != null && String(body.delete_contact_id).trim() !== ''
      ? String(body.delete_contact_id).trim()
      : null;

  if (rawDeleteContactId) {
    let delQ = supabase
      .from('sap_lead_contact')
      .delete()
      .eq('id', rawDeleteContactId)
      .eq('sap_lead_id', lead.id);
    if (rawLocId) {
      delQ = delQ.eq('sap_lead_location_id', rawLocId);
    } else {
      delQ = delQ.is('sap_lead_location_id', null);
    }
    const { data: deletedRows, error: delErr } = await delQ.select('id');
    if (delErr) {
      console.error('masterlist lead contact delete:', delErr);
      return res.status(500).json({ success: false, error: delErr.message });
    }
    if (!deletedRows?.length) {
      return res.status(404).json({ success: false, error: 'Contact not found or not in this scope' });
    }
    await writeAuditLogFromRequest(req, {
      action: AUDIT_ACTIONS.LEAD_UPDATE,
      category: AUDIT_CATEGORIES.LEAD,
      entityType: 'lead',
      entityId: lead.id,
      entityLabel: lead.lead_name || leadCode,
      description: `Masterlist lead contact removed for ${leadCode}`,
      details: { subAction: 'delete_contact', contactId: rawDeleteContactId, sapLeadLocationId: rawLocId },
      status: AUDIT_STATUS.SUCCESS,
    });
    return res.status(200).json({ success: true, message: 'Contact removed' });
  }

  const leadUpdates = {};
  if (body.lead_name !== undefined) leadUpdates.lead_name = String(body.lead_name || '').trim() || lead.lead_name;
  if (body.phone_number !== undefined) leadUpdates.phone_number = body.phone_number ? String(body.phone_number).trim() : null;
  if (body.email !== undefined) leadUpdates.email = body.email ? String(body.email).trim() : null;
  if (body.lead_address !== undefined) {
    leadUpdates.lead_address = body.lead_address ? String(body.lead_address).trim() : null;
  }

  if (Object.keys(leadUpdates).length > 0) {
    leadUpdates.updated_at = new Date().toISOString();
    const { error: upErr } = await supabase.from('sap_lead').update(leadUpdates).eq('id', lead.id);
    if (upErr) {
      console.error('masterlist lead update:', upErr);
      return res.status(500).json({ success: false, error: upErr.message });
    }
  }

  const hasContactPayload =
    body.contact_person !== undefined ||
    body.contact_first_name !== undefined ||
    body.contact_last_name !== undefined ||
    body.contact_email !== undefined ||
    body.contact_phone !== undefined;

  if (hasContactPayload) {
    let first_name = '-';
    let last_name = '-';
    if (body.contact_person !== undefined && String(body.contact_person).trim()) {
      const sp = splitPersonName(body.contact_person);
      first_name = sp.first_name;
      last_name = sp.last_name;
    } else {
      if (body.contact_first_name !== undefined) {
        first_name = String(body.contact_first_name || '').trim() || '-';
      }
      if (body.contact_last_name !== undefined) {
        last_name = String(body.contact_last_name || '').trim() || '-';
      }
    }

    const contactEmail =
      body.contact_email !== undefined
        ? body.contact_email
          ? String(body.contact_email).trim()
          : null
        : undefined;
    const contactPhone =
      body.contact_phone !== undefined
        ? body.contact_phone
          ? String(body.contact_phone).trim()
          : null
        : undefined;

    const rawContactId =
      body.contact_id != null && String(body.contact_id).trim() !== ''
        ? String(body.contact_id).trim()
        : null;
    const forceNewSiteContact =
      rawLocId && body.create_new_site_contact === true && !rawContactId;

    const payload = {
      sap_lead_id: lead.id,
      sap_lead_location_id: rawLocId,
      first_name,
      last_name,
      middle_name: null,
    };
    if (contactEmail !== undefined) payload.email = contactEmail;
    if (contactPhone !== undefined) payload.tel1 = contactPhone;

    if (rawContactId) {
      const { data: verified, error: verErr } = await supabase
        .from('sap_lead_contact')
        .select('id, sap_lead_location_id')
        .eq('id', rawContactId)
        .eq('sap_lead_id', lead.id)
        .maybeSingle();
      if (verErr) {
        console.error('masterlist lead contact verify:', verErr);
        return res.status(500).json({ success: false, error: verErr.message });
      }
      if (!verified?.id) {
        return res.status(400).json({ success: false, error: 'contact_id not found for this lead' });
      }
      const locOk = rawLocId
        ? verified.sap_lead_location_id === rawLocId
        : verified.sap_lead_location_id == null;
      if (!locOk) {
        return res.status(400).json({ success: false, error: 'contact_id does not belong to this scope' });
      }
      const { error: cupErr } = await supabase.from('sap_lead_contact').update(payload).eq('id', rawContactId);
      if (cupErr) {
        console.error('masterlist lead contact update:', cupErr);
        return res.status(500).json({ success: false, error: cupErr.message });
      }
    } else if (forceNewSiteContact) {
      const insertPayload = {
        ...payload,
        tel2: null,
        email: contactEmail !== undefined ? contactEmail : null,
        tel1: contactPhone !== undefined ? contactPhone : null,
      };
      const { error: insErr } = await supabase.from('sap_lead_contact').insert(insertPayload);
      if (insErr) {
        console.error('masterlist lead contact insert:', insErr);
        return res.status(500).json({ success: false, error: insErr.message });
      }
    } else {
      let contactQ = supabase
        .from('sap_lead_contact')
        .select('id')
        .eq('sap_lead_id', lead.id);
      if (rawLocId) {
        contactQ = contactQ.eq('sap_lead_location_id', rawLocId);
      } else {
        contactQ = contactQ.is('sap_lead_location_id', null);
      }
      const { data: existingList, error: cfindErr } = await contactQ
        .order('id', { ascending: true })
        .limit(1);

      if (cfindErr) {
        console.error('masterlist lead contact find:', cfindErr);
        return res.status(500).json({ success: false, error: cfindErr.message });
      }

      const existing = existingList?.[0];

      if (existing?.id) {
        const { error: cupErr } = await supabase
          .from('sap_lead_contact')
          .update(payload)
          .eq('id', existing.id);
        if (cupErr) {
          console.error('masterlist lead contact update:', cupErr);
          return res.status(500).json({ success: false, error: cupErr.message });
        }
      } else {
        const insertPayload = {
          ...payload,
          tel2: null,
          email: contactEmail !== undefined ? contactEmail : null,
          tel1: contactPhone !== undefined ? contactPhone : null,
        };
        const { error: insErr } = await supabase.from('sap_lead_contact').insert(insertPayload);
        if (insErr) {
          console.error('masterlist lead contact insert:', insErr);
          return res.status(500).json({ success: false, error: insErr.message });
        }
      }
    }
  }

  await writeAuditLogFromRequest(req, {
    action: AUDIT_ACTIONS.LEAD_UPDATE,
    category: AUDIT_CATEGORIES.LEAD,
    entityType: 'lead',
    entityId: lead.id,
    entityLabel: lead.lead_name || leadCode,
    description: `SAP lead masterlist updated: ${leadCode}`,
    details: {
      subAction: hasContactPayload ? 'update_contact' : 'update_lead',
      sapLeadLocationId: rawLocId,
      leadCode,
    },
    changes: buildChanges(lead, { ...lead, ...leadUpdates }),
    status: AUDIT_STATUS.SUCCESS,
  });

  return res.status(200).json({ success: true, message: 'SAP lead masterlist updated' });
}
