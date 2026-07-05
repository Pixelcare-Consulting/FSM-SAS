import React from 'react';
import { format, addDays, subDays } from 'date-fns';
import { 
  BsDownload, 
  BsArrowRepeat,
  BsChevronLeft,
  BsChevronRight,
  BsCalendar3
} from 'react-icons/bs';
import styles from './TimelineScheduler.module.css';

const ToolbarControls = ({
  selectedDate,
  onDateChange,
  searchValue,
  onSearchChange,
  customerFilter,
  onCustomerFilterChange,
  customers = [],
  onRefresh,
  onDownload,
  viewMode = 'day',
  onViewModeChange,
  isLoading,
}) => {
  const handlePrevDay = () => {
    onDateChange(subDays(selectedDate, 1));
  };

  const handleNextDay = () => {
    onDateChange(addDays(selectedDate, 1));
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const handleDateInputChange = (e) => {
    const newDate = new Date(e.target.value);
    if (!isNaN(newDate.getTime())) {
      onDateChange(newDate);
    }
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.toolbarLeft}>
        {/* Date Navigation */}
        <div className={styles.filterGroup}>
          <button 
            type="button" 
            className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
            onClick={handlePrevDay}
            aria-label="Previous day"
          >
            <BsChevronLeft />
          </button>
          
          <input
            type="date"
            className={styles.dateInput}
            value={format(selectedDate, 'yyyy-MM-dd')}
            onChange={handleDateInputChange}
          />
          
          <button 
            type="button" 
            className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
            onClick={handleNextDay}
            aria-label="Next day"
          >
            <BsChevronRight />
          </button>
          
          <button 
            type="button" 
            className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
            onClick={handleToday}
          >
            <BsCalendar3 />
            <span>Today</span>
          </button>
        </div>

        {/* Customer Filter */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Customer:</span>
          <select
            className={styles.filterSelect}
            value={customerFilter}
            onChange={(e) => onCustomerFilterChange(e.target.value)}
          >
            <option value="">All Customers</option>
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name}
              </option>
            ))}
          </select>
        </div>

        {/* Worker Search */}
        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Worker:</span>
          <input
            type="text"
            className={styles.dateInput}
            placeholder="Search workers..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ minWidth: '160px' }}
          />
        </div>

        {/* View Toggle */}
        <div className={styles.viewToggle}>
          <button
            type="button"
            className={`${styles.viewToggleBtn} ${viewMode === 'day' ? styles.active : ''}`}
            onClick={() => onViewModeChange?.('day')}
          >
            Day
          </button>
          <button
            type="button"
            className={`${styles.viewToggleBtn} ${viewMode === 'week' ? styles.active : ''}`}
            onClick={() => onViewModeChange?.('week')}
          >
            Week
          </button>
        </div>
      </div>

      <div className={styles.toolbarRight}>
        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
          onClick={onDownload}
          title="Download Schedule"
        >
          <BsDownload />
          <span>Download</span>
        </button>

        <button
          type="button"
          className={`${styles.actionBtn} ${styles.actionBtnOutline}`}
          onClick={onRefresh}
          disabled={isLoading}
          title="Refresh Data"
        >
          <BsArrowRepeat className={isLoading ? 'spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>
    </div>
  );
};

export default ToolbarControls;

