/** Slim selects for session settings bundle (egress reduction). */

export const SETTINGS_ROW_SELECT = 'id, value, updated_at';

export const COMPANY_DETAILS_SELECT = `
  id,
  logo,
  name,
  address,
  email,
  phone,
  website,
  pay_to,
  bank_name,
  account_no,
  paynow,
  payment_instruction
`;

const SETTINGS_IDS = ['followUp', 'jobStatuses'];
const COMPANY_INFO_ID = 'companyInfo';

/**
 * Load followUp, jobStatuses, and companyInfo in one server round-trip.
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
export async function fetchSettingsBundle(supabase) {
  if (!supabase) {
    throw new Error('Database unavailable');
  }

  const [settingsResult, companyResult] = await Promise.all([
    supabase.from('settings').select(SETTINGS_ROW_SELECT).in('id', SETTINGS_IDS),
    supabase
      .from('company_details')
      .select(COMPANY_DETAILS_SELECT)
      .eq('id', COMPANY_INFO_ID)
      .maybeSingle(),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (companyResult.error && companyResult.error.code !== 'PGRST116') {
    throw companyResult.error;
  }

  const settingsById = {};
  for (const row of settingsResult.data || []) {
    if (row?.id) settingsById[row.id] = row;
  }

  return {
    followUp: settingsById.followUp?.value ?? null,
    jobStatuses: settingsById.jobStatuses?.value ?? null,
    companyInfo: companyResult.data ?? null,
    fetchedAt: new Date().toISOString(),
  };
}
