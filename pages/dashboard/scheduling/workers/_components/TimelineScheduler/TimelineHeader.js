import React, { useMemo } from 'react';
import { addHours, startOfDay, format } from 'date-fns';
import styles from './TimelineScheduler.module.css';

const TimelineHeader = ({
  selectedDate,
  startHour,
  endHour,
  cellWidth,
  currentTime,
}) => {
  const totalHours = endHour - startHour;
  
  const timeSlots = useMemo(() => {
    const slots = [];
    const dayStart = startOfDay(selectedDate);
    
    for (let hour = startHour; hour < endHour; hour++) {
      const time = addHours(dayStart, hour);
      const isCurrentHour = currentTime && 
        currentTime.getHours() === hour &&
        format(currentTime, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
      
      slots.push({
        hour,
        time,
        label: format(time, 'h:mm a'),
        shortLabel: format(time, 'ha').toLowerCase(),
        isCurrentHour,
      });
    }
    
    return slots;
  }, [selectedDate, startHour, endHour, currentTime]);

  return (
    <div 
      className={styles.timelineHeader}
      style={{
        gridTemplateColumns: `140px repeat(${totalHours}, minmax(${cellWidth}px, 1fr))`,
      }}
    >
      {/* Corner Cell */}
      <div className={styles.headerCorner}>
        <span className={styles.headerCornerLabel}>Workers</span>
      </div>
      
      {/* Time Slots */}
      {timeSlots.map((slot) => (
        <div
          key={slot.hour}
          className={`${styles.timeSlot} ${slot.isCurrentHour ? styles.timeSlotHighlight : ''}`}
        >
          {slot.label}
        </div>
      ))}
    </div>
  );
};

export default TimelineHeader;

