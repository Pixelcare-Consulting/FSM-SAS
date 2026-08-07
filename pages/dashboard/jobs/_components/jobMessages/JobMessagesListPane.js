import React from 'react';
import { Button, Form, Spinner } from 'react-bootstrap';
import { Search, X as FeatherX } from 'react-feather';
import TablePagination from '../../../../../components/common/TablePagination';
import { formatShortTs, senderBadge, truncate } from '@/lib/jobs/jobMessagesUiUtils';
import styles from '../../JobMessages.module.css';

const JobMessagesListPane = ({
  searchDraft,
  setSearchDraft,
  onSearchKeyDown,
  itemsPerPage,
  onItemsPerPageChange,
  hasActiveFilters,
  onClearFilters,
  rows,
  totalCount,
  isLoading,
  isFetching,
  error,
  selectedJobId,
  onSelectRow,
  currentPage,
  totalPages,
  onPageChange,
  hiddenOnMobile = false,
}) => {
  return (
    <section
      className={`${styles.listPane}${hiddenOnMobile ? ` ${styles.paneHiddenMobile}` : ''}`}
      aria-label="Message list"
    >
      <div className={styles.listToolbar}>
        <div className={styles.listToolbarRow}>
          <div className={styles.searchWrap}>
            <Search size={16} className={styles.searchIcon} aria-hidden />
            <Form.Control
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={onSearchKeyDown}
              placeholder="Search job # or message…"
              className={styles.searchInput}
              autoComplete="off"
            />
          </div>
          <Form.Select
            size="sm"
            value={String(itemsPerPage)}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value) || 25)}
            aria-label="Conversations per page"
            className={styles.pageSizeSelect}
          >
            <option value="10">10 / page</option>
            <option value="25">25 / page</option>
            <option value="50">50 / page</option>
            <option value="100">100 / page</option>
          </Form.Select>
          {hasActiveFilters ? (
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onClearFilters}
              className="d-flex align-items-center gap-1"
            >
              <FeatherX size={14} />
              Clear
            </Button>
          ) : null}
        </div>
        <small className={styles.listMeta}>
          Showing <strong>{rows.length}</strong> of <strong>{totalCount}</strong> conversations
          {isFetching && !isLoading ? ' · Updating…' : ''}
          <span className="d-none d-md-inline"> · Press Enter to search</span>
        </small>
      </div>

      <div className={styles.listBody}>
        {error ? (
          <div className={styles.stateBlock}>{error.message || 'Failed to load messages'}</div>
        ) : isLoading ? (
          <div className={`${styles.stateBlock} ${styles.stateMuted}`}>
            <Spinner animation="border" size="sm" className="me-2" />
            Loading messages…
          </div>
        ) : rows.length === 0 ? (
          <div className={`${styles.stateBlock} ${styles.stateMuted}`}>No matching conversations found.</div>
        ) : (
          <ul className={styles.messageList}>
            {rows.map((row) => {
              const unread = Boolean(row.isUnread);
              const isSelected = Boolean(selectedJobId) && selectedJobId === row.jobId;
              return (
                <li key={row.jobId || row.id}>
                  <button
                    type="button"
                    className={`${styles.messageRow}${unread ? ` ${styles.messageRowUnread}` : ''}${
                      isSelected ? ` ${styles.messageRowSelected}` : ''
                    }`}
                    onClick={() => onSelectRow(row)}
                  >
                    <span
                      className={unread ? styles.unreadDot : styles.unreadDotSpacer}
                      aria-hidden
                    />
                    <span className={styles.messageRowMain}>
                      <span className={styles.messageRowTop}>
                        <span className={styles.jobNumber}>{row.jobNumber || 'Job'}</span>
                        <span className={styles.messageTime}>{formatShortTs(row.createdAt)}</span>
                      </span>
                      <span className={styles.messageRowMid}>
                        <span className={styles.roleChip}>{senderBadge(row.senderType)}</span>
                        <span className={styles.senderName}>{row.senderName}</span>
                        <span className={styles.msgCountChip}>
                          {row.messageCount > 1
                            ? `${row.messageCount} msgs`
                            : row.messageCount === 1
                              ? '1 msg'
                              : ''}
                        </span>
                      </span>
                      <span className={styles.messageSnippet}>
                        {truncate(row.message, 120) ||
                          (row.imageUrl ? '[Image attachment]' : '—')}
                        {row.customerName ? (
                          <span className={styles.snippetCustomer}>
                            {' '}
                            · {truncate(row.customerName, 40)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {totalCount > 0 ? (
        <div className={styles.listFooter}>
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            totalItems={totalCount}
          />
        </div>
      ) : null}
    </section>
  );
};

export default JobMessagesListPane;
