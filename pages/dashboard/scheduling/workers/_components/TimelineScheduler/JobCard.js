import React, { useMemo } from 'react';
import { format } from 'date-fns';
import styles from './TimelineScheduler.module.css';

// Color palette matching the design
const JOB_COLORS = {
  red: { bg: '#dc2626', text: '#fff' },
  orange: { bg: '#ea580c', text: '#fff' },
  yellow: { bg: '#ca8a04', text: '#fff' },
  green: { bg: '#16a34a', text: '#fff' },
  teal: { bg: '#0d9488', text: '#fff' },
  blue: { bg: '#2563eb', text: '#fff' },
  indigo: { bg: '#4f46e5', text: '#fff' },
  purple: { bg: '#7c3aed', text: '#fff' },
  pink: { bg: '#db2777', text: '#fff' },
  gray: { bg: '#4b5563', text: '#fff' },
  black: { bg: '#111827', text: '#fff' },
  cyan: { bg: '#0891b2', text: '#fff' },
  magenta: { bg: '#c026d3', text: '#fff' },
};

// Status badge colors
const STATUS_COLORS = {
  SCHEDULED: { bg: 'rgba(255,255,255,0.25)', text: 'inherit' },
  ASSIGNED: { bg: 'rgba(59, 130, 246, 0.3)', text: 'inherit' },
  IN_PROGRESS: { bg: 'rgba(245, 158, 11, 0.3)', text: 'inherit' },
  COMPLETED: { bg: 'rgba(16, 185, 129, 0.3)', text: 'inherit' },
  RESCHEDULED: { bg: 'rgba(239, 68, 68, 0.3)', text: 'inherit' },
};

const getColorFromHex = (hex) => {
  if (!hex) return JOB_COLORS.blue;
  
  // If it's already a named color
  if (JOB_COLORS[hex]) return JOB_COLORS[hex];
  
  // Return the hex as custom color
  return { bg: hex, text: '#fff' };
};

const isLightColor = (hex) => {
  if (!hex || typeof hex !== 'string') return false;
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return false;
  
  const r = parseInt(cleanHex.substr(0, 2), 16);
  const g = parseInt(cleanHex.substr(2, 2), 16);
  const b = parseInt(cleanHex.substr(4, 2), 16);
  
  // Calculate relative luminance
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
};

const JobCard = ({ 
  event, 
  style,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging 
}) => {
  const colorScheme = useMemo(() => getColorFromHex(event.color), [event.color]);
  const isLight = useMemo(() => isLightColor(colorScheme.bg), [colorScheme.bg]);
  
  const startTime = event.start ? format(new Date(event.start), 'h:mm a') : '';
  const endTime = event.end ? format(new Date(event.end), 'h:mm a') : '';
  
  const statusStyle = STATUS_COLORS[event.status] || STATUS_COLORS.SCHEDULED;
  
  const handleClick = (e) => {
    e.stopPropagation();
    onClick?.(event);
  };
  
  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(event));
    e.dataTransfer.effectAllowed = 'move';
    onDragStart?.(event);
  };
  
  const handleDragEnd = (e) => {
    onDragEnd?.(event);
  };

  return (
    <button
      type="button"
      className={`${styles.jobCard} ${isLight ? styles.jobCardLight : styles.jobCardDark} ${isDragging ? styles.dragGhost : ''}`}
      style={{
        ...style,
        backgroundColor: colorScheme.bg,
      }}
      onClick={handleClick}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      title={`${event.jobNumber || event.title} - ${event.meta?.customerName || 'No customer'}`}
    >
      <div className={styles.jobCardHeader}>
        <span className={styles.jobNumber}>
          {event.jobNumber ? `#${event.jobNumber}` : 'JOB'}
        </span>
        {event.status && (
          <span 
            className={styles.jobStatus}
            style={{ 
              background: statusStyle.bg,
            }}
          >
            {event.status.replace('_', ' ')}
          </span>
        )}
      </div>
      
      <div className={styles.jobTitle}>
        {event.title || 'Untitled Job'}
      </div>
      
      <div className={styles.jobTime}>
        {startTime} - {endTime}
      </div>
      
      {event.meta?.customerName && (
        <div className={styles.jobCustomer}>
          {event.meta.customerName}
        </div>
      )}
      
      {event.location && (
        <div className={styles.jobLocation}>
          {event.location}
        </div>
      )}
      
      {event.meta?.description && (
        <div className={styles.jobDescription}>
          {event.meta.description}
        </div>
      )}
    </button>
  );
};

export default JobCard;

