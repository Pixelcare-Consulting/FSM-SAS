/**
 * Canonical job number generation for YYYY-XXXXXX format.
 * Uses a bounded string range so lexicographic order matches numeric order.
 * Verifies availability against all rows (unique constraint is not limited to active jobs).
 */

export function isDuplicateJobNumberError(error) {
  const message = error?.message || '';
  const code = error?.code || '';
  return (
    code === '23505' ||
    message.includes('jobs_job_number_key') ||
    message.includes('duplicate key value violates unique constraint')
  );
}

function parseJobNumberNumeric(jobNumber) {
  if (!jobNumber || typeof jobNumber !== 'string') return null;
  const parts = jobNumber.split('-');
  const numericPart = parts.length > 1 ? parts[1] : parts[0];
  const num = parseInt(numericPart, 10);
  return Number.isNaN(num) ? null : num;
}

async function fetchMaxActiveJobNumber(supabase, year) {
  const lo = `${year}-000000`;
  const hi = `${year}-999999`;
  const { data: maxRow, error } = await supabase
    .from('jobs')
    .select('job_number')
    .gte('job_number', lo)
    .lte('job_number', hi)
    .is('deleted_at', null)
    .order('job_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return parseJobNumberNumeric(maxRow?.job_number);
}

async function jobNumberExists(supabase, jobNumber) {
  const { data, error } = await supabase
    .from('jobs')
    .select('id')
    .eq('job_number', jobNumber)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{ year?: number, minNumeric?: number }} [options]
 * @returns {Promise<string>}
 */
export async function getNextJobNumber(supabase, options = {}) {
  const year = options.year ?? new Date().getFullYear();
  let nextNumber = 1;

  if (typeof options.minNumeric === 'number' && options.minNumeric >= 1) {
    nextNumber = options.minNumeric;
  } else {
    const maxNumeric = await fetchMaxActiveJobNumber(supabase, year);
    if (maxNumeric != null) nextNumber = maxNumeric + 1;
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${year}-${String(nextNumber).padStart(6, '0')}`;
    const exists = await jobNumberExists(supabase, candidate);
    if (!exists) return candidate;
    nextNumber += 1;
  }

  throw new Error('Could not find an available job number');
}

/**
 * Reserve sequential job numbers for a batch (e.g. multiple service dates).
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {number} count
 * @param {{ year?: number }} [options]
 * @returns {Promise<string[]>}
 */
export async function getNextJobNumbers(supabase, count, options = {}) {
  if (!count || count < 1) return [];

  const year = options.year ?? new Date().getFullYear();
  const first = await getNextJobNumber(supabase, { year });
  const firstNumeric = parseJobNumberNumeric(first);
  if (firstNumeric == null) {
    throw new Error('Failed to parse generated job number');
  }

  const numbers = [first];
  for (let i = 1; i < count; i += 1) {
    numbers.push(`${year}-${String(firstNumeric + i).padStart(6, '0')}`);
  }

  for (const candidate of numbers) {
    const exists = await jobNumberExists(supabase, candidate);
    if (exists) {
      return getNextJobNumbers(supabase, count, options);
    }
  }

  return numbers;
}
