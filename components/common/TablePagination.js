import React, { useState, useEffect } from 'react';
import { Button, Form, InputGroup } from 'react-bootstrap';
import styles from './TablePagination.module.css';

/**
 * Unified Table Pagination Component
 * 
 * Features:
 * - First / Previous / Next / Last navigation
 * - Manual page number input
 * - "Page X of Y" display
 * - Consistent design across all tables
 * 
 * @param {Object} props
 * @param {number} props.currentPage - Current page number (1-indexed)
 * @param {number} props.totalPages - Total number of pages
 * @param {number} props.totalItems - Total number of items (optional, for display)
 * @param {Function} props.onPageChange - Callback when page changes (receives new page number)
 * @param {boolean} props.disabled - Disable all controls
 * @param {string} props.className - Additional CSS classes
 */
const TablePagination = ({
  currentPage = 1,
  totalPages = 1,
  totalItems = null,
  onPageChange,
  disabled = false,
  className = ''
}) => {
  const [inputValue, setInputValue] = useState(currentPage.toString());
  const [isEditing, setIsEditing] = useState(false);

  // Update input value when currentPage changes externally
  useEffect(() => {
    if (!isEditing) {
      setInputValue(currentPage.toString());
    }
  }, [currentPage, isEditing]);

  const handlePrevious = () => {
    if (currentPage > 1 && !disabled) {
      onPageChange(currentPage - 1);
    }
  };

  const handleNext = () => {
    if (currentPage < totalPages && !disabled) {
      onPageChange(currentPage + 1);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    // Allow empty input while typing
    if (value === '' || /^\d+$/.test(value)) {
      setInputValue(value);
    }
  };

  const handleInputBlur = () => {
    setIsEditing(false);
    const pageNum = parseInt(inputValue, 10);
    
    if (isNaN(pageNum) || pageNum < 1) {
      setInputValue(currentPage.toString());
    } else if (pageNum > totalPages) {
      setInputValue(totalPages.toString());
      onPageChange(totalPages);
    } else if (pageNum !== currentPage) {
      onPageChange(pageNum);
    } else {
      setInputValue(currentPage.toString());
    }
  };

  const handleInputFocus = () => {
    setIsEditing(true);
  };

  const handleInputKeyPress = (e) => {
    if (e.key === 'Enter') {
      e.target.blur();
    }
  };

  const handleFirstPage = () => {
    if (!disabled && currentPage !== 1) {
      onPageChange(1);
    }
  };

  const handleLastPage = () => {
    if (!disabled && currentPage !== totalPages) {
      onPageChange(totalPages);
    }
  };

  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  // Don't render if only one page
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className={`${styles.paginationContainer} ${className}`}>
      <div className={styles.paginationContent}>
        {/* First Entry */}
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleFirstPage}
          disabled={isFirstPage || disabled}
          className={styles.navButton}
          aria-label="First page"
        >
          <span className={styles.buttonText}>First Entry</span>
        </Button>

        {/* Previous Button */}
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handlePrevious}
          disabled={isFirstPage || disabled}
          className={styles.navButton}
          aria-label="Previous page"
        >
          <span className={styles.buttonText}>Previous</span>
        </Button>

        {/* Page Info and Input */}
        <div className={styles.pageInfo}>
          {totalItems !== null ? (
            <span className={styles.itemsCount}>
              {totalItems.toLocaleString()} {totalItems === 1 ? 'item' : 'items'}, 
            </span>
          ) : null}
          <span className={styles.pageLabel}>Page</span>
          <InputGroup size="sm" className={styles.pageInputGroup}>
            <Form.Control
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onBlur={handleInputBlur}
              onFocus={handleInputFocus}
              onKeyPress={handleInputKeyPress}
              disabled={disabled}
              className={styles.pageInput}
              aria-label="Page number"
              min="1"
              max={totalPages}
            />
          </InputGroup>
          <span className={styles.pageOf}>of {totalPages}</span>
        </div>

        {/* Next Button */}
        <Button
          variant="primary"
          size="sm"
          onClick={handleNext}
          disabled={isLastPage || disabled}
          className={styles.navButton}
          aria-label="Next page"
        >
          <span className={styles.buttonText}>Next</span>
        </Button>

        {/* Last Entry */}
        <Button
          variant="outline-secondary"
          size="sm"
          onClick={handleLastPage}
          disabled={isLastPage || disabled}
          className={styles.navButton}
          aria-label="Last page"
        >
          <span className={styles.buttonText}>Last Entry</span>
        </Button>
      </div>
    </div>
  );
};

export default TablePagination;

