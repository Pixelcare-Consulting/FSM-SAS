/**
 * Business rule: when `only_creator_can_edit` is true, only the creating user may update/delete.
 * (Supabase admin client bypasses RLS — API routes must enforce this explicitly.)
 *
 * @param {{ only_creator_can_edit?: boolean, created_by?: string | null } | null | undefined} row
 * @param {string | null | undefined} viewerUserId dashboard `uid` cookie (public.users.id)
 * @returns {boolean}
 */
export function canMutateCompanyMemo(row, viewerUserId) {
  if (!row) return false;
  const uid = viewerUserId != null && viewerUserId !== '' ? String(viewerUserId) : '';
  if (!uid) return false;
  if (!row.only_creator_can_edit) return true;
  return String(row.created_by ?? '') === uid;
}
