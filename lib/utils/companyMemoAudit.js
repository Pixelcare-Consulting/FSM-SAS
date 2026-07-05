/**
 * Audit snapshots for company memos (omit large body HTML).
 * @param {object | null | undefined} row
 */
export function memoAuditSnapshot(row) {
  if (!row || typeof row !== 'object') return {};
  const body = row.body;
  const hasBody =
    body != null && typeof body === 'string' && body.replace(/<[^>]+>/g, '').trim().length > 0;

  return {
    subject: row.subject ?? null,
    folder: row.folder || 'General',
    priority: row.priority ?? null,
    expires_at: row.expires_at ?? null,
    is_group_memo: !!row.is_group_memo,
    target_group: row.target_group ?? null,
    show_on_sign_in: !!row.show_on_sign_in,
    show_on_job_screen: !!row.show_on_job_screen,
    show_on_dispatch_screen: !!row.show_on_dispatch_screen,
    show_in_header: row.show_in_header !== false,
    only_creator_can_edit: !!row.only_creator_can_edit,
    has_body: hasBody,
  };
}
