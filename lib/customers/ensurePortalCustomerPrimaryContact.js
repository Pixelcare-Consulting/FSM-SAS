export async function ensurePortalCustomerPrimaryContact({
  supabase,
  customerId,
  customerName,
  phoneNumber,
  email
}) {
  if (!supabase || !customerId) return null;

  const normalizedName =
    typeof customerName === 'string' && customerName.trim()
      ? customerName.trim()
      : '';
  const normalizedPhone =
    typeof phoneNumber === 'string' && phoneNumber.trim()
      ? phoneNumber.trim()
      : null;
  const normalizedEmail =
    typeof email === 'string' && email.trim()
      ? email.trim()
      : null;

  if (!normalizedName && !normalizedPhone && !normalizedEmail) {
    return null;
  }

  const { data: existingContacts, error: fetchError } = await supabase
    .from('contacts')
    .select('id, first_name, middle_name, last_name, tel1, tel2, email')
    .eq('customer_id', customerId)
    .limit(1);

  if (fetchError) {
    throw fetchError;
  }

  if (existingContacts && existingContacts.length > 0) {
    return existingContacts[0];
  }

  const { data: newContact, error: insertError } = await supabase
    .from('contacts')
    .insert({
      customer_id: customerId,
      first_name: normalizedName,
      middle_name: null,
      last_name: '',
      tel1: normalizedPhone,
      tel2: null,
      email: normalizedEmail
    })
    .select()
    .single();

  if (insertError) {
    throw insertError;
  }

  return newContact;
}
