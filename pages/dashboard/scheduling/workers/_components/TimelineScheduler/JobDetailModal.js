import React from 'react';
import { format } from 'date-fns';
import styles from './TimelineScheduler.module.css';
import frame from '../../../../../../components/modals/DetailModal.module.css';
import { phoneLinkRow } from '../../../../../../lib/utils/toTelHref';

const JobDetailModal = ({
  event,
  onClose,
  onViewJob,
  onEdit,
  onReassign,
  technicians = [],
}) => {
  const [showReassignDropdown, setShowReassignDropdown] = React.useState(false);
  const [selectedNewTechnician, setSelectedNewTechnician] = React.useState(null);
  const [isReassigning, setIsReassigning] = React.useState(false);

  if (!event) return null;

  const handleToggleReassign = () => {
    setShowReassignDropdown(!showReassignDropdown);
    if (!showReassignDropdown) {
      setSelectedNewTechnician(null);
    }
  };

  const handleReassign = async () => {
    if (!selectedNewTechnician || !onReassign) return;
    
    setIsReassigning(true);
    try {
      await onReassign(event, selectedNewTechnician);
      setShowReassignDropdown(false);
      setSelectedNewTechnician(null);
    } catch (error) {
      console.error('Reassign error:', error);
    } finally {
      setIsReassigning(false);
    }
  };

  const startTime = event.start ? format(new Date(event.start), 'PPP p') : 'N/A';
  const endTime = event.end ? format(new Date(event.end), 'PPP p') : 'N/A';

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className={frame.modalOverlay} onClick={handleOverlayClick}>
      <div className={frame.modalContent}>
        <div className={frame.modalHeader}>
          <h3 className={frame.modalTitle}>
            {event.title || 'Job Details'}
            {event.jobNumber && (
              <span style={{ 
                marginLeft: '8px',
                fontSize: '14px',
                background: '#e5e7eb',
                padding: '4px 8px',
                borderRadius: '4px',
                color: '#374151'
              }}>
                #{event.jobNumber}
              </span>
            )}
          </h3>
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
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>Job Number</span>
            <span className={frame.detailValue}>#{event.jobNumber || 'N/A'}</span>
          </div>
          
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>Status</span>
            <span className={frame.detailValue}>
              <span style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '12px',
                fontWeight: '500',
                background: getStatusColor(event.status),
                color: '#fff'
              }}>
                {event.status?.replace('_', ' ') || 'SCHEDULED'}
              </span>
            </span>
          </div>
          
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>Start Time</span>
            <span className={frame.detailValue}>{startTime}</span>
          </div>
          
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>End Time</span>
            <span className={frame.detailValue}>{endTime}</span>
          </div>
          
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>Customer</span>
            <span className={frame.detailValue}>{event.meta?.customerName || 'No customer assigned'}</span>
          </div>
          
          <div className={frame.detailRow}>
            <span className={frame.detailLabel}>Location</span>
            <span className={frame.detailValue}>{event.location || 'No location provided'}</span>
          </div>

          {(() => {
            const m = event.meta || {};
            const name = (m.siteContactName || '').trim();
            const office = (m.siteContactPhone || '').trim();
            const mobile = (m.siteContactMobile || '').trim();
            const email = (m.siteContactEmail || '').trim();
            const extra =
              typeof m.siteContactExtraCount === 'number' && m.siteContactExtraCount > 0
                ? m.siteContactExtraCount
                : 0;
            const officeRow = office ? phoneLinkRow(office) : null;
            const mobileRow = mobile ? phoneLinkRow(mobile) : null;
            const notSpec = <span style={{ color: '#9ca3af' }}>Not specified</span>;

            return (
              <>
                <div className={frame.detailRow}>
                  <span className={frame.detailLabel}>Contact Person</span>
                  <span className={frame.detailValue}>
                    {name || notSpec}
                    {extra > 0 ? (
                      <span style={{ color: '#6b7280', fontSize: '12px', marginLeft: '8px' }}>
                        (+{extra} more on site — open full job)
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className={frame.detailRow}>
                  <span className={frame.detailLabel}>Office Phone</span>
                  <span className={frame.detailValue}>
                    {office && officeRow ? (
                      <>
                        <a
                          href={officeRow.telHref || '#'}
                          style={{ color: '#2563eb' }}
                          title={officeRow.telHref ? `Call ${officeRow.label}` : undefined}
                          onClick={(e) => !officeRow.telHref && e.preventDefault()}
                        >
                          {officeRow.label}
                        </a>
                        {officeRow.waHref ? (
                          <>
                            {' '}
                            <a
                              href={officeRow.waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#16a34a', fontSize: '12px' }}
                            >
                              WhatsApp
                            </a>
                          </>
                        ) : null}
                      </>
                    ) : (
                      notSpec
                    )}
                  </span>
                </div>
                <div className={frame.detailRow}>
                  <span className={frame.detailLabel}>Mobile Phone</span>
                  <span className={frame.detailValue}>
                    {mobile && mobileRow ? (
                      <>
                        <a
                          href={mobileRow.telHref || '#'}
                          style={{ color: '#2563eb' }}
                          title={mobileRow.telHref ? `Call ${mobileRow.label}` : undefined}
                          onClick={(e) => !mobileRow.telHref && e.preventDefault()}
                        >
                          {mobileRow.label}
                        </a>
                        {mobileRow.waHref ? (
                          <>
                            {' '}
                            <a
                              href={mobileRow.waHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: '#16a34a', fontSize: '12px' }}
                            >
                              WhatsApp
                            </a>
                          </>
                        ) : null}
                      </>
                    ) : (
                      notSpec
                    )}
                  </span>
                </div>
                <div className={frame.detailRow}>
                  <span className={frame.detailLabel}>Email</span>
                  <span className={frame.detailValue}>
                    {email ? (
                      <a href={`mailto:${encodeURIComponent(email)}`} style={{ color: '#2563eb', wordBreak: 'break-all' }}>
                        {email}
                      </a>
                    ) : (
                      notSpec
                    )}
                  </span>
                </div>
              </>
            );
          })()}
          
          {event.meta?.description && (
            <div className={frame.detailRow}>
              <span className={frame.detailLabel}>Description</span>
              <span className={frame.detailValue}>{event.meta.description}</span>
            </div>
          )}
          
          {/* Reassign Section */}
          {onReassign && technicians.length > 0 && (
            <div className={styles.reassignSection}>
              <button
                type="button"
                className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
                onClick={handleToggleReassign}
                disabled={isReassigning}
              >
                {showReassignDropdown ? 'Cancel Reassign' : 'Reassign'}
              </button>
              
              {showReassignDropdown && (
                <div className={styles.reassignDropdown}>
                  <label className={styles.reassignLabel}>
                    Select New Technician:
                  </label>
                  <select
                    className={styles.reassignSelect}
                    value={selectedNewTechnician?.id || ''}
                    onChange={(e) => {
                      const tech = technicians.find(t => t.id === e.target.value || t.resourceId === e.target.value);
                      setSelectedNewTechnician(tech || null);
                    }}
                    disabled={isReassigning}
                  >
                    <option value="">-- Select Technician --</option>
                    {technicians
                      .filter(tech => {
                        const techId = tech.id || tech.resourceId;
                        return techId !== event.resourceId && techId !== event.technicianId;
                      })
                      .map((tech) => {
                        const techId = tech.id || tech.resourceId;
                        return (
                          <option key={techId} value={techId}>
                            {tech.text || tech.name} {tech.subtext || tech.email ? `(${tech.subtext || tech.email})` : ''}
                          </option>
                        );
                      })}
                  </select>
                  {selectedNewTechnician && (
                    <button
                      type="button"
                      className={`${styles.actionBtn} ${styles.actionBtnWarning}`}
                      onClick={handleReassign}
                      disabled={isReassigning}
                    >
                      {isReassigning ? 'Reassigning...' : 'Confirm Reassign'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className={frame.modalFooter}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
            onClick={onClose}
          >
            Close
          </button>
          {onEdit && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
              onClick={() => onEdit(event)}
            >
              Edit
            </button>
          )}
          {onViewJob && event.jobId && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => onViewJob(event.jobId)}
            >
              View Full Job
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const getStatusColor = (status) => {
  switch (status) {
    case 'COMPLETED': return '#16a34a';
    case 'IN_PROGRESS': return '#f59e0b';
    case 'ASSIGNED': return '#3b82f6';
    case 'RESCHEDULED': return '#ef4444';
    case 'SCHEDULED':
    default: return '#6b7280';
  }
};

export default JobDetailModal;

