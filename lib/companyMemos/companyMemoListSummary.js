/** Slim list select for company memos admin grid (no full-table client fetch). */
export const COMPANY_MEMO_LIST_SELECT = `
  id,
  subject,
  body,
  priority,
  expires_at,
  folder,
  created_at,
  created_by,
  show_in_header,
  show_on_sign_in,
  only_creator_can_edit,
  creator:users!company_memos_created_by_fkey ( id, username )
`;

export const COMPANY_MEMO_SEARCH_FIELDS = [
  'subject',
  'body',
  'folder',
  'priority',
];

/**
 * @param {Record<string, unknown>} row
 */
export function formatCompanyMemoListRow(row) {
  if (!row) return null;
  return {
    ...row,
    folder: row.folder || 'General',
  };
}
