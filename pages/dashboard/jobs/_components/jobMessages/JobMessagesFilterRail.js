import React from 'react';
import Link from 'next/link';
import { FOLDERS } from '@/lib/jobs/jobMessagesUiUtils';
import styles from '../../JobMessages.module.css';

const JobMessagesFilterRail = ({
  folderId,
  unreadCount = 0,
  onFolderChange,
}) => {
  return (
    <aside className={styles.filterRail} aria-label="Message filters">
      <Link href="/jobs" className={styles.openJobsLink}>
        <i className="fe fe-briefcase" aria-hidden />
        Open Jobs
      </Link>
      <ul className={styles.folderList}>
        {FOLDERS.map((folder) => {
          const active = folderId === folder.id;
          const showCount = folder.id === 'unread' && unreadCount > 0;
          return (
            <li key={folder.id}>
              <button
                type="button"
                className={`${styles.folderBtn}${active ? ` ${styles.folderBtnActive}` : ''}`}
                onClick={() => onFolderChange(folder.id)}
                aria-current={active ? 'page' : undefined}
              >
                <span className={styles.folderBtnLabel}>
                  <i className={folder.icon} aria-hidden />
                  {folder.label}
                </span>
                {showCount ? (
                  <span className={styles.folderPill}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
};

export default JobMessagesFilterRail;
