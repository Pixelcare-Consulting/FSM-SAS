/**
 * A job can be linked to another customer's service call while staying under its
 * own customer (contact, address, routing). The call's owner is kept on the job in
 * jobs.service_call_owner_code / service_call_owner_name so SAP sync can book the
 * Activity under the owner: SAP only links an Activity to a call of the same BP.
 */

/** The call's owner card code when it is not one of the job customer's codes, else null. */
export function foreignServiceCallOwnerCode(serviceCall, customerCardCodes = []) {
  const ownerCode = String(serviceCall?.customerCode || "").trim();
  if (!ownerCode) return null;
  const isOwnCustomer = customerCardCodes.some(
    (code) => String(code || "").trim().toUpperCase() === ownerCode.toUpperCase()
  );
  return isOwnCustomer ? null : ownerCode;
}

/** Portal customer.id for an SAP card code, or null when that customer isn't in the portal. */
export async function findCustomerIdByCardCode(supabase, cardCode) {
  const code = String(cardCode || "").trim();
  if (!supabase || !code) return null;
  for (const column of ["customer_code", "sap_card_code"]) {
    const { data } = await supabase
      .from("customer")
      .select("id")
      .eq(column, code)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}
