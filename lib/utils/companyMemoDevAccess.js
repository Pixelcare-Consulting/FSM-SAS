import {
  MEMO_FOLDERS,
  UPDATE_LOGS_FOLDER,
} from '../constants/companyMemoFolders';
import { canMutateCompanyMemo } from './companyMemoAccess';

/** @type {readonly string} */
export const DEV_MEMO_EMAIL_DOMAIN = '@pixelcareconsulting.com';

/**
 * @param {unknown} email
 */
export function canManageUpdateLogsFolder(email) {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith(DEV_MEMO_EMAIL_DOMAIN);
}

/**
 * Folder options for the memo form / filters.
 * @param {unknown} email
 */
export function memoFoldersForEmail(email) {
  if (canManageUpdateLogsFolder(email)) {
    return [...MEMO_FOLDERS];
  }
  return MEMO_FOLDERS.filter((f) => f !== UPDATE_LOGS_FOLDER);
}

/**
 * Server-side guard for create/update/delete of Update Logs memos.
 * @param {object} opts
 * @param {string | null | undefined} opts.email
 * @param {string | null | undefined} opts.requestedFolder
 * @param {string | null | undefined} [opts.existingFolder]
 * @returns {{ error: string } | null}
 */
export function assertUpdateLogsMemoAccess({
  email,
  requestedFolder,
  existingFolder,
}) {
  const nextFolder = requestedFolder || existingFolder || 'General';
  const touchesUpdateLogs =
    nextFolder === UPDATE_LOGS_FOLDER || existingFolder === UPDATE_LOGS_FOLDER;

  if (touchesUpdateLogs && !canManageUpdateLogsFolder(email)) {
    return {
      error:
        'Update Logs are restricted to developers with a @pixelcareconsulting.com email.',
    };
  }
  return null;
}

/**
 * Admin memo edit/delete including Update Logs dev restriction.
 * @param {object | null | undefined} row
 * @param {string | null | undefined} viewerUserId
 * @param {unknown} viewerEmail
 */
export function canMutateCompanyMemoWithFolder(row, viewerUserId, viewerEmail) {
  if (!row) return false;
  if (
    (row.folder || 'General') === UPDATE_LOGS_FOLDER &&
    !canManageUpdateLogsFolder(viewerEmail)
  ) {
    return false;
  }
  return canMutateCompanyMemo(row, viewerUserId);
}
