import React, { useState, useEffect } from 'react';
import { CheckCircle, Database, MapPin, Key } from 'lucide-react';

/**
 * Modern Interactive Loading Indicator for Customer List
 * Features:
 * - Progress tracking for multi-step data fetching
 * - Skeleton loader matching table structure
 * - Smooth animations
 * - Prevents refresh loops
 * - Theme-consistent design (blue/white)
 */

const CustomerListLoadingIndicator = ({
  loading = false,
  currentStep = 0,
  totalSteps = 2,
  stepMessages = [],
  progress = 0,
  fetchedCount = 0,
  estimatedTotal = 0,
  logEntries = [],
  onCancel = null,
  /** Overlay title (defaults to customer list copy) */
  title = 'Loading Customer Data from SAP',
  /** When false, hides the SAP merge steps block */
  showStepsSection = true,
  /** When false, hides FSM + SAP tips */
  showTipsSection = true,
  /** Replaces “Step X of Y” / “Preparing…” in the progress row */
  progressCaption = null,
  /** When non-empty, cycles these in the progress row instead of progressCaption */
  rotatingProgressCaptions = [],
  rotateProgressIntervalMs = 4500,
  /** Indeterminate bar animation (e.g. scheduler with unknown progress) */
  indeterminate = false,
  footerPrimary = 'Please wait while we fetch all customer data...',
  footerSecondary = 'This may take a moment for large datasets',
  /** When non-empty, footer cycles these instead of static footerPrimary/footerSecondary */
  rotatingTips = [],
  rotateTipsIntervalMs = 5000,
}) => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const [tipIndex, setTipIndex] = useState(0);
  const [progressCaptionIndex, setProgressCaptionIndex] = useState(0);

  const tipsCount = Array.isArray(rotatingTips) ? rotatingTips.length : 0;
  const useRotatingTips = tipsCount > 0;
  const progressCaptions = Array.isArray(rotatingProgressCaptions) ? rotatingProgressCaptions : [];
  const progressCaptionCount = progressCaptions.length;
  const useRotatingProgress = progressCaptionCount > 0;

  // Track elapsed time
  useEffect(() => {
    if (!loading) {
      setElapsedTime(0);
      return;
    }

    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 2000);

    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    if (!loading) {
      setTipIndex(0);
      return;
    }
    if (!useRotatingTips) return;

    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % tipsCount);
    }, rotateTipsIntervalMs);

    return () => clearInterval(id);
  }, [loading, useRotatingTips, tipsCount, rotateTipsIntervalMs]);

  useEffect(() => {
    if (!loading) {
      setProgressCaptionIndex(0);
      return;
    }
    if (!useRotatingProgress) return;

    const id = setInterval(() => {
      setProgressCaptionIndex((i) => (i + 1) % progressCaptionCount);
    }, rotateProgressIntervalMs);

    return () => clearInterval(id);
  }, [loading, useRotatingProgress, progressCaptionCount, rotateProgressIntervalMs]);

  // Always render if loading is true, even if other props are not set yet
  if (!loading) return null;

  const formatTime = (seconds) => {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const stepLabels = [
    'Fetching Customers (SAP)',
    'Merging Address Data'
  ];

  const tips = [
    {
      title: 'SAP Data',
      text: 'Address data is pulled from SAP B1 using SAP queries.',
      icon: Database,
      color: '#3b82f6'
    },
    {
      title: 'Service Location Mapping',
      text: 'SiteID and AddressName help map work orders to service locations.',
      icon: MapPin,
      color: '#10b981'
    },
    {
      title: 'Customer Code Integrity',
      text: 'CardCode links customers to service calls, contracts, and invoices.',
      icon: Key,
      color: '#f59e0b'
    }
  ];

  const safeLogEntries = Array.isArray(logEntries) ? logEntries : [];

  const getStepStatus = (stepIndex) => {
    if (currentStep === 0) return 'pending';
    if (stepIndex < currentStep) return 'completed';
    if (stepIndex === currentStep) return 'active';
    return 'pending';
  };

  return (
    <>
      <style jsx>{`
        .loading-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
        }

        .customer-loading-container {
          background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
          border-radius: 16px;
          padding: 2.5rem;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3), 0 4px 20px rgba(59, 130, 246, 0.2);
          border: 1px solid rgba(59, 130, 246, 0.3);
          max-width: 800px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
        }

        .loading-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 1.5rem;
        }

        .loading-title {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-size: 1.25rem;
          font-weight: 600;
          color: #1e40af;
        }

        .spinner-container {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .steps-container {
          margin-bottom: 1.5rem;
        }

        .step-item {
          display: flex;
          align-items: center;
          padding: 0.75rem 1rem;
          margin-bottom: 0.5rem;
          border-radius: 8px;
          transition: all 0.3s ease;
          background: #f8fafc;
        }

        .step-item.active {
          background: linear-gradient(90deg, #dbeafe 0%, #e0f2fe 100%);
          border-left: 4px solid #3b82f6;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.15);
        }

        .step-item.completed {
          background: #f0fdf4;
          border-left: 4px solid #10b981;
        }

        .step-item.pending {
          opacity: 0.6;
        }

        .step-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          margin-right: 0.75rem;
        }

        .step-item.active .step-icon {
          background: #3b82f6;
          color: white;
        }

        .step-item.completed .step-icon {
          background: #10b981;
          color: white;
        }

        .step-item.pending .step-icon {
          background: #e5e7eb;
          color: #9ca3af;
        }

        .step-content {
          flex: 1;
        }

        .step-label {
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 0.25rem;
        }

        .step-message {
          font-size: 0.875rem;
          color: #64748b;
        }

        .progress-section {
          margin-bottom: 1.5rem;
        }

        .progress-info {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
        }

        .progress-text {
          font-size: 0.875rem;
          font-weight: 500;
          color: #475569;
        }

        .progress-stats {
          display: flex;
          gap: 1rem;
          font-size: 0.875rem;
          color: #64748b;
        }

        .custom-progress-bar {
          height: 10px;
          border-radius: 10px;
          overflow: hidden;
          background: #e2e8f0;
        }

        .custom-progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #3b82f6 0%, #60a5fa 50%, #3b82f6 100%);
          transition: width 0.3s ease;
        }

        .custom-progress-fill.indeterminate {
          width: 38% !important;
          transition: none;
          animation: schedulerIndeterminate 1.35s ease-in-out infinite;
        }

        @keyframes schedulerIndeterminate {
          0% {
            transform: translateX(-20%);
          }
          50% {
            transform: translateX(220%);
          }
          100% {
            transform: translateX(-20%);
          }
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
          gap: 0.75rem;
          margin-bottom: 1.25rem;
        }

        .kpi-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 10px;
          padding: 0.75rem 0.875rem;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
        }

        .kpi-label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
          margin-bottom: 0.25rem;
        }

        .kpi-value {
          font-size: 1.1rem;
          font-weight: 600;
          color: #0f172a;
        }

        .tips-section {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem 1.25rem;
          background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          margin-bottom: 1rem;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
        }

        .tips-title {
          font-size: 0.95rem;
          font-weight: 600;
          color: #1e293b;
          margin-bottom: 0.75rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        .tips-title::before {
          content: '💡';
          font-size: 1.1rem;
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.1);
            opacity: 0.8;
          }
        }

        .tips-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 0.75rem;
        }

        .tips-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem 1.125rem;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
          transition: all 0.3s ease;
          position: relative;
          overflow: hidden;
          animation: fadeInUp 0.6s ease-out forwards;
          opacity: 0;
        }

        .tips-card:nth-child(1) {
          animation-delay: 0.1s;
        }

        .tips-card:nth-child(2) {
          animation-delay: 0.2s;
        }

        .tips-card:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .tips-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 8px 16px rgba(15, 23, 42, 0.12);
          border-color: #cbd5e1;
        }

        .tips-card-header {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 0.5rem;
        }

        .tips-card-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: all 0.3s ease;
        }

        .tips-card:hover .tips-card-icon {
          transform: scale(1.1) rotate(5deg);
        }

        .tips-card-title {
          font-size: 0.875rem;
          font-weight: 600;
          color: #0f172a;
          flex: 1;
        }

        .tips-card-text {
          font-size: 0.85rem;
          color: #475569;
          line-height: 1.5;
        }

        .tips-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          height: 3px;
          background: linear-gradient(90deg, transparent, currentColor, transparent);
          opacity: 0;
          transition: opacity 0.3s ease;
        }

        .tips-card:hover::before {
          opacity: 0.3;
        }

        .log-details {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 0.75rem 1rem;
          background: #ffffff;
          font-size: 0.85rem;
          color: #475569;
          margin-bottom: 1.5rem;
        }

        .log-details summary {
          cursor: pointer;
          font-weight: 600;
          color: #1e40af;
          margin-bottom: 0.5rem;
        }

        .log-details ul {
          margin: 0.5rem 0 0;
          padding-left: 1.25rem;
        }

        .log-entry-time {
          color: #94a3b8;
          margin-right: 0.5rem;
          font-variant-numeric: tabular-nums;
        }

        .loading-footer {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-top: 1.5rem;
          padding-top: 1rem;
          border-top: 1px solid #e2e8f0;
        }

        .loading-time {
          display: flex;
          align-items: flex-start;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #64748b;
          flex: 1;
          min-width: 0;
        }

        .rotating-tip-text {
          display: block;
          line-height: 1.55;
          color: #475569;
          animation: tipFadeIn 0.45s ease;
        }

        @keyframes tipFadeIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .progress-caption-rotate {
          display: inline-block;
          animation: tipFadeIn 0.4s ease;
        }

        .loading-footer-tip-meta {
          flex-shrink: 0;
          font-size: 0.75rem;
          color: #94a3b8;
          text-align: right;
          max-width: 42%;
        }

        .cancel-button {
          background: transparent;
          border: 1px solid #e2e8f0;
          color: #64748b;
          padding: 0.5rem 1rem;
          border-radius: 6px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .cancel-button:hover {
          background: #fee2e2;
          border-color: #fca5a5;
          color: #dc2626;
        }

        .estimated-time {
          font-size: 0.75rem;
          color: #94a3b8;
          margin-top: 0.25rem;
        }
      `}</style>

      <div className="loading-overlay">
        <div className="customer-loading-container">
        {/* Header */}
        <div className="loading-header">
          <div className="loading-title">
            <span>{title}</span>
          </div>
          {onCancel && (
            <button className="cancel-button" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>

            {/* Progress Bar */}
            <div className="progress-section">
            <div className="progress-info">
            <div className="progress-text">
              {useRotatingProgress ? (
                <span key={progressCaptionIndex} className="progress-caption-rotate">
                  {progressCaptions[progressCaptionIndex % progressCaptionCount]}
                </span>
              ) : progressCaption != null && String(progressCaption).trim() !== '' ? (
                progressCaption
              ) : currentStep > 0 && currentStep <= totalSteps ? (
                `Step ${currentStep} of ${totalSteps}`
              ) : currentStep === 0 ? (
                'Preparing...'
              ) : (
                'Initializing...'
              )}
            </div>
            <div className="progress-stats">
              {fetchedCount > 0 && estimatedTotal > 0 && (
                <span>
                  {fetchedCount.toLocaleString()} / {estimatedTotal.toLocaleString()}
                </span>
              )}
              <span>•</span>
              <span>{formatTime(elapsedTime)}</span>
            </div>
          </div>
          <div className="custom-progress-bar">
            <div 
              className={`custom-progress-fill${indeterminate ? ' indeterminate' : ''}`}
              style={indeterminate ? undefined : { width: `${Math.max(progress, 5)}%` }}
            />
          </div>
          {estimatedTotal > 0 && fetchedCount < estimatedTotal && (
            <div className="estimated-time">
              Estimated: {Math.ceil((estimatedTotal - fetchedCount) / Math.max(fetchedCount / elapsedTime, 1))}s remaining
            </div>
          )}
        </div>

        {/* Steps Progress */}
        {showStepsSection && (
        <div className="steps-container">
          {stepLabels.map((label, index) => {
            const status = getStepStatus(index);
            const message = stepMessages[index] || '';
            
            return (
              <div key={index} className={`step-item ${status}`}>
                <div className="step-icon">
                  {status === 'completed' && (
                    <CheckCircle size={18} />
                  )}
                </div>
                <div className="step-content">
                  <div className="step-label">{label}</div>
                  {message && (
                    <div className="step-message">{message}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        )}

        {/* FSM/SAP Tips */}
        {showTipsSection && (
        <div className="tips-section">
          <div className="tips-title">FSM + SAP tips while you wait</div>
          <div className="tips-grid">
            {tips.map((tip, index) => {
              const IconComponent = tip.icon;
              return (
                <div key={tip.title} className="tips-card" style={{ '--tip-color': tip.color }}>
                  <div className="tips-card-header">
                    <div 
                      className="tips-card-icon"
                      style={{ 
                        background: `${tip.color}15`,
                        color: tip.color
                      }}
                    >
                      <IconComponent size={20} />
                    </div>
                    <div className="tips-card-title">{tip.title}</div>
                  </div>
                  <div className="tips-card-text">{tip.text}</div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Live Log */}
        {/* <details className="log-details">
          <summary>Live sync log</summary>
          <ul>
            {safeLogEntries.length === 0 ? (
              <li>Waiting for updates...</li>
            ) : (
              safeLogEntries.map((entry, index) => (
                <li key={`${entry.time}-${index}`}>
                  <span className="log-entry-time">{entry.time}</span>
                  {entry.message}
                </li>
              ))
            )}
          </ul>
        </details> */}

        {/* Footer */}
        <div className="loading-footer">
          <div className="loading-time">
            {useRotatingTips ? (
              <span key={tipIndex} className="rotating-tip-text">
                {rotatingTips[tipIndex % tipsCount]}
              </span>
            ) : (
              <span>{footerPrimary}</span>
            )}
          </div>
          <div className="loading-footer-tip-meta">
            {useRotatingTips ? `Tip ${tipIndex + 1} of ${tipsCount}` : footerSecondary}
          </div>
        </div>
        </div>
      </div>

    </>
  );
};

export default CustomerListLoadingIndicator;
