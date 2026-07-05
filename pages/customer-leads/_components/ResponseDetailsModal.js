import React from 'react';
import Link from 'next/link';
import { Spinner } from 'react-bootstrap';
import { format } from 'date-fns';
import {
  User,
  Calendar,
  Clock,
  FileCheck,
  CheckCircle,
  XCircle,
  AlertCircle,
  Eye,
  RefreshCw,
} from 'lucide-react';
import SAPSyncButton from '@/components/SAPSyncButton';
import frame from '@/components/modals/DetailModal.module.css';

// Self-contained date helpers (identical to the Customer Leads page).
const formatDate = (dateString) => {
  if (!dateString || dateString === '-') return '-';
  try {
    return format(new Date(dateString), 'MMM d, yyyy');
  } catch {
    return dateString;
  }
};

const formatDateTime = (dateString) => {
  if (!dateString || dateString === '-') return '-';
  try {
    return format(new Date(dateString), 'MMM d, yyyy h:mm a');
  } catch {
    return dateString;
  }
};

const pillStyle = (bg, color = '#fff') => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '9999px',
  fontSize: '12px',
  fontWeight: 600,
  background: bg,
  color,
});

const CardRow = ({ label, children }) => (
  <div className={frame.cardRow}>
    <span className={frame.cardLabel}>{label}</span>
    <span className={frame.cardValue}>{children}</span>
  </div>
);

const getInitials = (name) => {
  if (!name || name === '-') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return parts[0][0] + parts[parts.length - 1][0];
};

const ResponseDetailsModal = ({
  show,
  onClose,
  response,
  leadJobsByDate = {},
  createJobsStatus,
  isCreatingCustomer,
  onRequestConvertPreview,
  onCreateCustomer,
  isCreatingJobs,
  onCreateJobs,
  isSyncedToSAP,
  sapVerifyStatus,
  onSyncComplete,
}) => {
  if (!show || !response) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const isCustomer = response.rowType === 'customer';
  const synced = typeof isSyncedToSAP === 'function' ? isSyncedToSAP(response) : false;
  const needsResync = sapVerifyStatus?.needsResync === true;
  const sapStatusLoading = Boolean(response?.synced_to_sap_at && response?.customer_id && sapVerifyStatus === null);
  const showNeedsResync = needsResync && !sapStatusLoading;
  const hasServiceDate =
    response.firstServiceDate ||
    response.secondServiceDate ||
    response.thirdServiceDate ||
    response.fourthServiceDate;
  const jobsAlreadyCreated = Object.keys(leadJobsByDate).length > 0;
  const showCreateJobsRecovery =
    hasServiceDate &&
    !jobsAlreadyCreated &&
    response?.customer_id &&
    (synced || needsResync || (isCustomer && response?.synced_to_sap_at));

  const serviceDates = [
    { label: 'First Service', value: response.firstServiceDate, job: leadJobsByDate.first },
    { label: 'Second Service', value: response.secondServiceDate, job: leadJobsByDate.second },
    { label: 'Third Service', value: response.thirdServiceDate, job: leadJobsByDate.third },
    { label: 'Fourth Service', value: response.fourthServiceDate, job: leadJobsByDate.fourth },
  ];

  const renderConsent = (value) => {
    const yes = value && value !== '-' && value !== 'No';
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
        {yes ? (
          <CheckCircle size={16} color="#16a34a" />
        ) : (
          <XCircle size={16} color="#9ca3af" />
        )}
        <span style={pillStyle(yes ? '#16a34a' : '#9ca3af')}>{yes ? 'Yes' : 'No'}</span>
      </span>
    );
  };

  return (
    <div className={frame.modalOverlay} onClick={handleOverlayClick}>
      <div className={`${frame.modalContent} ${frame.xl}`}>
        <div className={frame.modalHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <span className={frame.headerAvatar}>{getInitials(response.fullName)}</span>
            <div style={{ minWidth: 0 }}>
              <h3 className={frame.modalTitle}>Response Details</h3>
              <div
                style={{
                  fontSize: '13px',
                  color: '#6b7280',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {response.fullName} ({response.email})
              </div>
            </div>
          </div>
          <button
            type="button"
            className={frame.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className={frame.modalBody}>
          <div className={frame.leadGrid}>
            {/* LEFT column: Basic Information */}
            <div className={frame.card}>
              <h4 className={frame.cardHeader}>
                <User size={14} />
                Basic Information
              </h4>
              {response.timestamp != null && (
                <CardRow label="Submitted">{formatDateTime(response.timestamp)}</CardRow>
              )}
              {isCustomer && !response.timestamp && (
                <CardRow label="Source">Portal customer</CardRow>
              )}
              {response.customer_code && (
                <CardRow label="Portal code">
                  <span style={pillStyle('#6b7280')}>{response.customer_code}</span>
                </CardRow>
              )}
              {response.sap_card_code && (
                <CardRow label="SAP Lead code">
                  <span style={pillStyle('#0ea5e9')}>{response.sap_card_code}</span>
                </CardRow>
              )}
              <CardRow label="Email">{response.email}</CardRow>
              <CardRow label="Name">
                {response.salutation && response.salutation !== '-' && `${response.salutation}. `}
                {response.fullName}
                {(response.firstName !== '-' || response.lastName !== '-') && (
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {response.firstName !== '-' && response.firstName}
                    {response.firstName !== '-' && response.lastName !== '-' && ' '}
                    {response.lastName !== '-' && response.lastName}
                  </div>
                )}
              </CardRow>
              <CardRow label="Handphone">{response.handphone}</CardRow>
              <CardRow label="Block">{response.block}</CardRow>
              <CardRow label="Unit">{response.unit}</CardRow>
              {response.address && response.address !== '-' && (
                <CardRow label="Address">{response.address}</CardRow>
              )}
            </div>

            {/* RIGHT column: Service Dates + Consent & Terms stacked */}
            <div className={frame.leadColStack}>
              <div className={frame.card}>
                <h4 className={frame.cardHeader}>
                  <Calendar size={14} />
                  Service Dates
                </h4>
                {serviceDates.map(({ label, value, job }) => (
                  <CardRow key={label} label={label}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      {formatDate(value)}
                      {job && (
                        <Link
                          href={`/dashboard/jobs/${job.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={`${frame.actionBtn} ${frame.actionBtnOutline}`}
                          style={{ textDecoration: 'none', padding: '2px 10px' }}
                        >
                          <Eye size={14} />
                          View Job
                        </Link>
                      )}
                    </span>
                  </CardRow>
                ))}
                <CardRow label="Time Slot">
                  <span style={pillStyle(response.timeSlot?.includes('AM') ? '#0ea5e9' : '#f59e0b')}>
                    {response.timeSlot}
                  </span>
                </CardRow>
              </div>

              <div className={frame.card}>
                <h4 className={frame.cardHeader}>
                  <FileCheck size={14} />
                  Consent &amp; Terms
                </h4>
                <CardRow label="Agreed to Terms">{renderConsent(response.agreedToTerms)}</CardRow>
                <CardRow label="Personal Info Consent">
                  {renderConsent(response.personalInfoConsent)}
                </CardRow>
              </div>
            </div>
          </div>
        </div>

        <div className={frame.modalFooter} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
          {createJobsStatus && (
            <div
              className={`alert alert-${
                createJobsStatus.type === 'success'
                  ? 'success'
                  : createJobsStatus.type === 'error'
                    ? 'danger'
                    : 'warning'
              } mb-2 d-flex align-items-center gap-2`}
              role="alert"
            >
              {createJobsStatus.type === 'success' ? (
                <CheckCircle size={18} />
              ) : (
                <AlertCircle size={18} />
              )}
              <span>{createJobsStatus.message}</span>
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'flex-end' }}>
            {!isCustomer && (!synced || showNeedsResync) && (
              <button
                type="button"
                className={`${frame.actionBtn} ${showNeedsResync ? frame.actionBtnOutline : frame.actionBtnSuccess}`}
                onClick={() => onRequestConvertPreview?.(response?.id)}
                disabled={isCreatingCustomer}
                title={
                  showNeedsResync
                    ? 'Re-sync customer to current SAP database'
                    : 'Create customer in SAP and assign a customer code'
                }
              >
                {isCreatingCustomer ? (
                  <>
                    <Spinner animation="border" size="sm" />
                    {showNeedsResync ? 'Re-syncing...' : 'Creating Customer...'}
                  </>
                ) : (
                  <>
                    {showNeedsResync ? <RefreshCw size={16} /> : <User size={16} />}
                    {showNeedsResync ? 'Re-sync to SAP' : 'Convert to SAP'}
                  </>
                )}
              </button>
            )}
            {isCustomer && (
              <SAPSyncButton
                customerId={response.customer_id}
                customerCode={response.customer_code}
                customerName={response.fullName}
                variant="outline-success"
                size="md"
                showLabel={true}
                onSyncComplete={onSyncComplete}
                isAlreadySynced={!!response?.synced_to_sap_at}
                needsResync={needsResync}
              />
            )}
            {sapStatusLoading && (
              <span className="text-muted small d-flex align-items-center gap-1">
                <Spinner animation="border" size="sm" />
                Checking SAP status...
              </span>
            )}
            {showNeedsResync && !sapStatusLoading ? (
              <span
                className="small d-flex align-items-center gap-1"
                style={{ color: '#d97706', fontWeight: 600 }}
              >
                <AlertCircle size={16} />
                Needs Live re-sync
                {sapVerifyStatus?.sapCardCode ? ` (${sapVerifyStatus.sapCardCode} not in current SAP)` : ''}
              </span>
            ) : null}
            {synced && !showNeedsResync && !sapStatusLoading ? (
              <span className="text-muted small d-flex align-items-center gap-1">
                <CheckCircle size={16} className="text-success" />
                SAP Lead synced
                {response?.sap_card_code ? ` (${response.sap_card_code})` : ''}
              </span>
            ) : null}
            {showCreateJobsRecovery && (
                <button
                  type="button"
                  className={`${frame.actionBtn} ${frame.actionBtnOutline}`}
                  onClick={() => onCreateJobs(response?.id)}
                  disabled={isCreatingJobs}
                  title="Create one job per service date (uses lead Name if customer not synced)"
                >
                  {isCreatingJobs ? (
                    <>
                      <Spinner animation="border" size="sm" />
                      Creating Jobs...
                    </>
                  ) : (
                    <>
                      <Calendar size={16} />
                      Create Jobs from Lead
                    </>
                  )}
                </button>
              )}
            <button
              type="button"
              className={`${frame.actionBtn} ${frame.actionBtnPrimary}`}
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResponseDetailsModal;
