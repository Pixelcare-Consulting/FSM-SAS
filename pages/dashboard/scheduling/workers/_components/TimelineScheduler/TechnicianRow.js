import React, { useMemo, useCallback } from 'react';
import { addHours, startOfDay, differenceInMinutes, format } from 'date-fns';
import JobCard from './JobCard';
import styles from './TimelineScheduler.module.css';

const TechnicianRow = ({
  technician,
  events,
  selectedDate,
  startHour,
  endHour,
  cellWidth,
  onCellClick,
  onEventClick,
  onEventDrop,
  currentTime,
}) => {
  const totalHours = endHour - startHour;
  
  // Get initials for avatar
  const initials = useMemo(() => {
    const name = technician.text || technician.name || '';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }, [technician]);
  
  // Filter events for this technician on this date
  const technicianEvents = useMemo(() => {
    const techId = String(technician.resourceId || technician.id);
    const dayStart = startOfDay(selectedDate);
    const dayEnd = addHours(dayStart, 24);
    
    return events.filter((event) => {
      const eventTechId = String(event.resourceId || event.technicianId);
      if (eventTechId !== techId) return false;
      
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Check if event overlaps with this day
      return eventStart < dayEnd && eventEnd > dayStart;
    });
  }, [events, technician, selectedDate]);
  
  // Calculate position and width for each event
  const positionedEvents = useMemo(() => {
    const dayStart = addHours(startOfDay(selectedDate), startHour);
    const totalMinutes = totalHours * 60;
    
    return technicianEvents.map((event) => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Clamp to visible range
      const visibleStart = eventStart < dayStart ? dayStart : eventStart;
      const dayEnd = addHours(dayStart, totalHours);
      const visibleEnd = eventEnd > dayEnd ? dayEnd : eventEnd;
      
      const startMinutes = differenceInMinutes(visibleStart, dayStart);
      const duration = differenceInMinutes(visibleEnd, visibleStart);
      
      const left = (startMinutes / totalMinutes) * 100;
      const width = (duration / totalMinutes) * 100;
      
      return {
        ...event,
        style: {
          left: `${left}%`,
          width: `${Math.max(width, 2)}%`,
        },
      };
    });
  }, [technicianEvents, selectedDate, startHour, totalHours]);
  
  // Generate time cells
  const timeCells = useMemo(() => {
    const cells = [];
    const dayStart = startOfDay(selectedDate);
    
    for (let hour = startHour; hour < endHour; hour++) {
      const cellTime = addHours(dayStart, hour);
      const isCurrentHour = currentTime && 
        currentTime.getHours() === hour &&
        format(currentTime, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
      
      cells.push({
        hour,
        time: cellTime,
        endTime: addHours(cellTime, 1),
        isCurrentHour,
      });
    }
    
    return cells;
  }, [selectedDate, startHour, endHour, currentTime]);
  
  const handleCellClick = useCallback((cell) => {
    onCellClick?.({
      start: cell.time,
      end: cell.endTime,
      workerId: technician.resourceId || technician.id,
    });
  }, [onCellClick, technician]);
  
  const handleDrop = useCallback((e, cell) => {
    e.preventDefault();
    try {
      const eventData = JSON.parse(e.dataTransfer.getData('text/plain'));
      onEventDrop?.(eventData, cell.time, cell.endTime, technician.resourceId || technician.id);
    } catch (err) {
      console.error('Drop error:', err);
    }
  }, [onEventDrop, technician]);
  
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  
  // Calculate current time indicator position
  const currentTimePosition = useMemo(() => {
    if (!currentTime) return null;
    if (format(currentTime, 'yyyy-MM-dd') !== format(selectedDate, 'yyyy-MM-dd')) return null;
    
    const currentHour = currentTime.getHours();
    const currentMinute = currentTime.getMinutes();
    
    if (currentHour < startHour || currentHour >= endHour) return null;
    
    const totalMinutes = totalHours * 60;
    const minutesFromStart = (currentHour - startHour) * 60 + currentMinute;
    
    return (minutesFromStart / totalMinutes) * 100;
  }, [currentTime, selectedDate, startHour, endHour, totalHours]);

  const avatarBg = technician.color || '#667eea';

  return (
    <div 
      className={styles.technicianRow}
      style={{
        gridTemplateColumns: `140px repeat(${totalHours}, minmax(${cellWidth}px, 1fr))`,
      }}
    >
      {/* Technician Info - Sticky Left */}
      <div className={styles.technicianInfo}>
        <div 
          className={styles.technicianAvatar}
          style={{ background: avatarBg }}
        >
          {initials}
        </div>
        <div className={styles.technicianDetails}>
          <div className={styles.technicianName}>{technician.text || technician.name}</div>
          <div className={styles.technicianRole}>{technician.subtext || technician.role || 'Technician'}</div>
        </div>
        <div className={`${styles.technicianStatus} ${technician.isOnline === false ? styles.technicianStatusOffline : ''}`} />
      </div>
      
      {/* Time Cells */}
      <div 
        style={{ 
          display: 'grid',
          gridColumn: '2 / -1',
          gridTemplateColumns: `repeat(${totalHours}, minmax(${cellWidth}px, 1fr))`,
          position: 'relative',
        }}
      >
        {timeCells.map((cell) => (
          <div
            key={cell.hour}
            className={`${styles.timeCell} ${cell.isCurrentHour ? styles.timeCellHighlight : ''}`}
            onClick={() => handleCellClick(cell)}
            onDrop={(e) => handleDrop(e, cell)}
            onDragOver={handleDragOver}
            aria-label={`Schedule at ${format(cell.time, 'h:mm a')}`}
          />
        ))}
        
        {/* Events Overlay */}
        {positionedEvents.map((event) => (
          <JobCard
            key={event.event_id || event.id}
            event={event}
            style={event.style}
            onClick={onEventClick}
          />
        ))}
        
        {/* Current Time Indicator */}
        {currentTimePosition !== null && (
          <div 
            className={styles.currentTimeIndicator}
            style={{ left: `${currentTimePosition}%` }}
          />
        )}
      </div>
    </div>
  );
};

export default TechnicianRow;

