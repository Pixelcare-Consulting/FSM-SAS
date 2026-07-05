const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(s) {
  return UUID_RE.test(String(s || '').trim());
}

/** Portal synthetic id when customer has email/phone but no masterlist contact row. */
function isSyntheticPortalContactId(id) {
  const v = String(id || '').trim().toLowerCase();
  return v === 'primary' || v === 'portal-primary';
}

function formatContactFields(selectedContact) {
  if (!selectedContact) return {};
  const fullName = `${selectedContact.firstName || ''} ${
    selectedContact.middleName || ''
  } ${selectedContact.lastName || ''}`.trim();
  return {
    firstName: selectedContact.firstName || '',
    middleName: selectedContact.middleName || '',
    lastName: selectedContact.lastName || '',
    phoneNumber: selectedContact.tel1 || selectedContact.phoneNumber || '',
    mobilePhone: selectedContact.tel2 || selectedContact.mobilePhone || '',
    email: selectedContact.email || '',
    contactFullname: fullName,
  };
}

/**
 * Resolve or upsert a contacts row from the job form picker.
 * @returns {Promise<string|null>} contacts.id or null when no contact selected
 */
export async function resolveContactIdFromSelection(
  supabase,
  { customerId, selectedContact },
) {
  if (!selectedContact || !customerId) return null;

  const pickedId = String(
    selectedContact.value || selectedContact.contactID || selectedContact.contactId || '',
  ).trim();

  if (isSyntheticPortalContactId(pickedId)) {
    return null;
  }

  if (isUuid(pickedId)) {
    return pickedId;
  }

  const contactData = formatContactFields(selectedContact);

  const { data: existingContact } = await supabase
    .from('contacts')
    .select('id')
    .eq('customer_id', customerId)
    .eq('first_name', contactData.firstName || '')
    .eq('last_name', contactData.lastName || '')
    .limit(1)
    .maybeSingle();

  if (existingContact?.id) {
    const { error: updateError } = await supabase
      .from('contacts')
      .update({
        middle_name: contactData.middleName || null,
        tel1: contactData.phoneNumber || null,
        tel2: contactData.mobilePhone || null,
        email: contactData.email || null,
      })
      .eq('id', existingContact.id);

    if (updateError) {
      console.error('Error updating contact:', updateError);
    }
    return existingContact.id;
  }

  const { data: newContact, error: contactError } = await supabase
    .from('contacts')
    .insert({
      customer_id: customerId,
      first_name: contactData.firstName || '',
      middle_name: contactData.middleName || null,
      last_name: contactData.lastName || '',
      tel1: contactData.phoneNumber || null,
      tel2: contactData.mobilePhone || null,
      email: contactData.email || null,
    })
    .select('id')
    .single();

  if (contactError) {
    console.error('Error creating contact:', contactError);
    return null;
  }

  return newContact?.id || null;
}
