import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  Col,
  Container,
  Form,
  Row,
  Spinner,
} from 'react-bootstrap';
import { format } from 'date-fns';
import { Search, X as FeatherX } from 'react-feather';
import { GeeksSEO } from 'widgets';
import { DashboardHeader } from 'sub-components';
import DashboardListStickySearch, {
  STICKY_SEARCH_GRADIENT_BLUE,
} from 'sub-components/dashboard/DashboardListStickySearch';
import TablePagination from '../../../components/common/TablePagination';
import { useEnterToSearch } from '@/hooks/useEnterToSearch';
import { useJobMessagesListQuery } from '../../../hooks/queries/useJobMessagesListQuery';

const TH = {
  backgroundColor: '#f8fafc',
  fontSize: '13px',
  fontWeight: '600',
  color: '#475569',
  padding: '14px 16px',
  borderBottom: '1px solid #e2e8f0',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
  whiteSpace: 'nowrap',
};

const TD = {
  fontSize: '14px',
  color: '#64748b',
  padding: '14px 16px',
  verticalAlign: 'middle',
  borderBottom: '1px solid #f1f5f9',
};

function truncate(str, n = 160) {
  if (!str) return '';
  return str.length <= n ? str : `${str.slice(0, n)}…`;
}

function formatTs(iso) {
  if (!iso) return '—';
  try {
    return format(new Date(iso), 'MMM d, yyyy h:mm a');
  } catch {
    return iso;
  }
}

function senderBadge(senderType) {
  const isAdmin = senderType === 'ADMIN';
  return (
    <Badge
      bg={isAdmin ? 'primary' : 'secondary'}
      className="text-uppercase"
      style={{ fontSize: 11 }}
    >
      {isAdmin ? 'Admin' : 'Technician'}
    </Badge>
  );
}

const JobMessagesHistoryPage = () => {
  const {
    draft: searchDraft,
    setDraft: setSearchDraft,
    applied: searchApplied,
    clear: clearSearch,
    onKeyDown: onSearchKeyDown,
  } = useEnterToSearch();
  const [senderType, setSenderType] = useState('all');
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [pageState, setPageState] = useState({ resetKey: '', page: 1 });

  const listResetKey = `${searchApplied}\0${senderType}\0${itemsPerPage}`;
  const currentPage = pageState.resetKey === listResetKey ? pageState.page : 1;
  const setCurrentPage = (page) => {
    setPageState({ resetKey: listResetKey, page });
  };

  const listParams = useMemo(
    () => ({
      page: currentPage,
      limit: itemsPerPage,
      search: searchApplied,
      senderType,
    }),
    [currentPage, itemsPerPage, searchApplied, senderType]
  );

  const { data, isLoading, isFetching, error } = useJobMessagesListQuery(listParams);

  const rows = data?.messages || [];
  const totalCount = data?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));
  const hasActiveFilters = searchApplied.length > 0 || senderType !== 'all';

  const clearAllFilters = () => {
    clearSearch();
    setSenderType('all');
    setCurrentPage(1);
  };

  return (
    <Container className="mt-1 mb-6">
      <GeeksSEO title="Job Messages | SAS&ME Portal" />
      <DashboardHeader
        title="Job Messages"
        subtitle="Full history of admin and technician messages across jobs."
        breadcrumbs={[
          { icon: 'fe fe-home', label: 'Dashboard', href: '/dashboard' },
          { label: 'Jobs', href: '/jobs' },
          { label: 'Job Messages' },
        ]}
      />

      <Row>
        <Col xs={12}>
          <DashboardListStickySearch style={STICKY_SEARCH_GRADIENT_BLUE}>
            <Row className="align-items-center">
              <Col md={12}>
                <div className="d-flex align-items-center gap-3 flex-wrap">
                  <div style={{ minWidth: '140px' }}>
                    <h6 className="mb-0 text-white d-flex align-items-center">
                      <Search className="me-2" size={18} />
                      Search
                    </h6>
                    <small className="text-white" style={{ opacity: 0.9, fontSize: '0.75rem' }}>
                      Press Enter to search
                    </small>
                  </div>
                  <div className="flex-grow-1" style={{ minWidth: 200 }}>
                    <Form.Control
                      type="text"
                      value={searchDraft}
                      onChange={(e) => setSearchDraft(e.target.value)}
                      onKeyDown={onSearchKeyDown}
                      placeholder="Job number or message text…"
                      style={{
                        fontSize: '0.95rem',
                        padding: '0.65rem 1rem',
                        border: 'none',
                        borderRadius: '8px',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      }}
                      autoComplete="off"
                    />
                  </div>
                  <Form.Select
                    size="sm"
                    value={senderType}
                    onChange={(e) => {
                      setSenderType(e.target.value);
                      setCurrentPage(1);
                    }}
                    aria-label="Filter by sender"
                    style={{
                      minWidth: 150,
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      fontWeight: 500,
                    }}
                  >
                    <option value="all">All senders</option>
                    <option value="ADMIN">Admin</option>
                    <option value="TECHNICIAN">Technician</option>
                  </Form.Select>
                  <Form.Select
                    size="sm"
                    value={String(itemsPerPage)}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value) || 25);
                      setCurrentPage(1);
                    }}
                    aria-label="Rows per page"
                    style={{
                      minWidth: 110,
                      borderRadius: '8px',
                      border: 'none',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                      fontWeight: 500,
                    }}
                  >
                    <option value="25">25 / page</option>
                    <option value="50">50 / page</option>
                    <option value="100">100 / page</option>
                  </Form.Select>
                  {hasActiveFilters ? (
                    <Button
                      variant="light"
                      size="sm"
                      onClick={clearAllFilters}
                      className="d-flex align-items-center gap-1"
                      style={{ minWidth: '90px', fontWeight: 500, borderRadius: '6px' }}
                    >
                      <FeatherX size={14} />
                      Clear
                    </Button>
                  ) : null}
                </div>
                <div className="mt-2 text-white" style={{ opacity: 0.9 }}>
                  <small style={{ fontSize: '0.85rem' }}>
                    Showing <strong>{rows.length}</strong> of <strong>{totalCount}</strong> messages
                    {isFetching && !isLoading ? ' · Updating…' : ''}
                  </small>
                </div>
              </Col>
            </Row>
          </DashboardListStickySearch>

          <Card className="border-0 shadow-sm">
            <Card.Body className="p-0">
              {error ? (
                <div className="p-4 text-danger">{error.message || 'Failed to load messages'}</div>
              ) : isLoading ? (
                <div className="p-5 text-center text-muted">
                  <Spinner animation="border" size="sm" className="me-2" />
                  Loading messages…
                </div>
              ) : rows.length === 0 ? (
                <div className="p-5 text-center text-muted">No messages found.</div>
              ) : (
                <div className="table-responsive">
                  <table className="table mb-0 align-middle">
                    <thead>
                      <tr>
                        <th style={TH}>Job #</th>
                        <th style={TH}>Customer</th>
                        <th style={TH}>Sender</th>
                        <th style={TH}>Message</th>
                        <th style={TH}>Sent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td style={TD}>
                            {row.jobId ? (
                              <Link
                                href={`/dashboard/jobs/${row.jobId}`}
                                style={{ color: '#4171F5', fontWeight: 600 }}
                              >
                                {row.jobNumber || 'Open job'}
                              </Link>
                            ) : (
                              row.jobNumber || '—'
                            )}
                            {row.jobTitle ? (
                              <div className="text-muted small mt-1">{truncate(row.jobTitle, 48)}</div>
                            ) : null}
                          </td>
                          <td style={TD}>
                            <div style={{ color: '#1e293b', fontWeight: 500 }}>
                              {row.customerName || '—'}
                            </div>
                            {row.customerCode ? (
                              <div className="text-muted small">{row.customerCode}</div>
                            ) : null}
                          </td>
                          <td style={TD}>
                            <div className="d-flex flex-column gap-1">
                              {senderBadge(row.senderType)}
                              <span style={{ color: '#1e293b' }}>{row.senderName}</span>
                            </div>
                          </td>
                          <td style={{ ...TD, maxWidth: 420 }}>
                            <div style={{ color: '#1e293b', whiteSpace: 'pre-wrap' }}>
                              {truncate(row.message, 220) || (
                                row.imageUrl ? '[Image attachment]' : '—'
                              )}
                            </div>
                          </td>
                          <td style={{ ...TD, whiteSpace: 'nowrap' }}>{formatTs(row.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card.Body>
            {totalCount > 0 ? (
              <Card.Footer className="bg-white border-top">
                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  totalItems={totalCount}
                />
              </Card.Footer>
            ) : null}
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default JobMessagesHistoryPage;
