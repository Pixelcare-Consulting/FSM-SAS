import React, { useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Checkbox,
  TableSortLabel,
  Box,
  useMediaQuery,
  useTheme,
  Typography,
  CircularProgress,
} from '@mui/material';

/**
 * ResponsiveTable - A reusable responsive MUI Table component
 * 
 * @param {Array} data - The data array to display
 * @param {Array} columns - Column definitions: [{ id, label, accessor, render, sortable, align, minWidth, paddingRight }]
 * @param {Function} onRowClick - Optional callback when a row is clicked (row, index) => void
 * @param {Boolean} loading - Loading state
 * @param {Function} renderEmptyState - Optional custom empty state renderer
 * @param {Boolean} selectable - Enable row selection
 * @param {Array} selectedRows - Array of selected row IDs
 * @param {Function} onSelectionChange - Callback when selection changes (selectedIds) => void
 * @param {String} orderBy - Current sort column ID
 * @param {String} order - Current sort order ('asc' | 'desc')
 * @param {Function} onSortChange - Callback when sort changes (columnId, order) => void
 * @param {Array} hiddenColumns - Array of column IDs to hide on mobile/tablet
 * @param {Boolean} fitWidth - When true, use fixed table layout, wrap text, and optional column.width (e.g. '12%') to avoid horizontal scroll
 */
const ResponsiveTable = ({
  data = [],
  columns = [],
  onRowClick,
  loading = false,
  renderEmptyState,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  orderBy = null,
  order = 'asc',
  onSortChange,
  hiddenColumns = [],
  showIndexColumn = false,
  rowOffset = 0,
  fitWidth = false,
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const isTablet = useMediaQuery(theme.breakpoints.down('lg'));

  // Filter visible columns based on screen size
  const visibleColumns = useMemo(() => {
    if (isMobile) {
      // On mobile, hide columns marked as hidden or less important
      return columns.filter((col) => {
        const isHidden = hiddenColumns.includes(col.id);
        const isImportant = col.important !== false; // Show important columns by default
        return !isHidden && isImportant;
      });
    } else if (isTablet) {
      // On tablet, show most columns but hide some
      return columns.filter((col) => !hiddenColumns.includes(col.id));
    }
    // On desktop, show all columns
    return columns;
  }, [columns, isMobile, isTablet, hiddenColumns]);

  const handleSort = (columnId) => {
    if (!onSortChange) return;
    
    const isAsc = orderBy === columnId && order === 'asc';
    onSortChange(columnId, isAsc ? 'desc' : 'asc');
  };

  const handleSelectAll = (event) => {
    if (!onSelectionChange) return;
    
    if (event.target.checked) {
      const allIds = data.map((row, index) => row.id || index);
      onSelectionChange(allIds);
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (rowId, event) => {
    if (!onSelectionChange) return;
    
    event.stopPropagation();
    const selectedIndex = selectedRows.indexOf(rowId);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = [...selectedRows, rowId];
    } else {
      newSelected = selectedRows.filter((id) => id !== rowId);
    }

    onSelectionChange(newSelected);
  };

  const isSelected = (rowId) => selectedRows.indexOf(rowId) !== -1;
  const isAllSelected = data.length > 0 && selectedRows.length === data.length;
  const isSomeSelected = selectedRows.length > 0 && selectedRows.length < data.length;

  const getCellValue = (row, column) => {
    if (column.render) {
      return column.render(row, row[column.accessor]);
    }
    if (column.accessor) {
      const value = typeof column.accessor === 'function' 
        ? column.accessor(row) 
        : row[column.accessor];
      return value ?? '';
    }
    return '';
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (data.length === 0) {
    if (renderEmptyState) {
      return renderEmptyState();
    }
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 200 }}>
        <Typography color="text.secondary">No data available</Typography>
      </Box>
    );
  }

  const fitCell = fitWidth
    ? {
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
        /** Same as checkbox column — avoids # / follow-up / badges sitting higher than the row checkboxes. */
        verticalAlign: 'middle',
        minWidth: 0,
        overflow: 'visible',
        fontSize: isMobile ? undefined : '0.8125rem',
        padding: isMobile ? undefined : '8px 6px',
      }
    : {};

  /** Identical head/body padding so header vs row checkboxes line up; avoids mixing `padding="checkbox"` with fitWidth overrides. */
  const fitCheckboxColSx = fitWidth
    ? {
        width: '2.5%',
        minWidth: 44,
        maxWidth: 56,
        padding: '6px 4px',
        textAlign: 'center',
        verticalAlign: 'middle',
        boxSizing: 'border-box',
      }
    : {};

  /** Same vertical padding as checkbox column so # lines up in the row. */
  const fitIndexColSx = fitWidth
    ? {
        ...fitCell,
        padding: '6px 4px',
        textAlign: 'center',
        verticalAlign: 'middle',
        width: '2%',
        minWidth: 36,
        maxWidth: 48,
        boxSizing: 'border-box',
      }
    : {};

  return (
    <TableContainer
      component={Paper}
      elevation={0}
      sx={{
        width: '100%',
        maxWidth: '100%',
        overflowX: fitWidth ? 'hidden' : 'auto',
        '& .MuiTable-root': {
          minWidth: fitWidth ? 0 : isMobile ? 600 : '100%',
        },
      }}
    >
      <Table
        size={fitWidth ? 'small' : 'medium'}
        sx={{
          width: '100%',
          minWidth: fitWidth ? 0 : 650,
          tableLayout: fitWidth ? 'fixed' : 'auto',
        }}
        aria-label="responsive table"
        stickyHeader
      >
        <TableHead>
          <TableRow>
            {selectable && (
              <TableCell
                padding={fitWidth ? 'none' : 'checkbox'}
                sx={{
                  backgroundColor: theme.palette.mode === 'light' ? '#f8f9fa' : '#1e1e1e',
                  ...(fitWidth
                    ? fitCheckboxColSx
                    : undefined),
                }}
              >
                <Checkbox
                  indeterminate={isSomeSelected}
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                  size="small"
                  disableRipple
                  sx={{ p: 0.5, m: 0 }}
                  inputProps={{ 'aria-label': 'select all rows' }}
                />
              </TableCell>
            )}
            {showIndexColumn && (
              <TableCell
                align="center"
                sx={{
                  fontWeight: 600,
                  backgroundColor: theme.palette.mode === 'light' ? '#f8f9fa' : '#1e1e1e',
                  width: fitWidth ? '2%' : 56,
                  whiteSpace: fitWidth ? 'normal' : 'nowrap',
                  ...(fitWidth ? fitIndexColSx : {}),
                  ...(isMobile && {
                    fontSize: '0.75rem',
                    padding: '8px 4px',
                  }),
                }}
              >
                #
              </TableCell>
            )}
            {visibleColumns.map((column) => {
              const canSort = column.sortable !== false && onSortChange;
              const isSorted = orderBy === column.id;
              
              return (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sx={{
                    fontWeight: 600,
                    backgroundColor: theme.palette.mode === 'light' ? '#f8f9fa' : '#1e1e1e',
                    whiteSpace: fitWidth ? 'normal' : 'nowrap',
                    minWidth: fitWidth ? (column.minWidth ?? 0) : column.minWidth || 'auto',
                    ...(fitWidth && column.width ? { width: column.width } : {}),
                    ...fitCell,
                    ...(column.paddingRight != null ? { paddingRight: column.paddingRight } : {}),
                    ...(isMobile && !fitWidth && {
                      fontSize: '0.75rem',
                      padding: '8px 4px',
                    }),
                  }}
                >
                  {canSort ? (
                    <TableSortLabel
                      active={isSorted}
                      direction={isSorted ? order : 'asc'}
                      onClick={() => handleSort(column.id)}
                      sx={{
                        whiteSpace: fitWidth ? 'normal' : undefined,
                        alignItems: fitWidth ? 'center' : undefined,
                        width: fitWidth ? '100%' : undefined,
                        lineHeight: fitWidth ? 1.2 : undefined,
                        '& .MuiTableSortLabel-icon': {
                          fontSize: '1rem',
                        },
                      }}
                    >
                      {column.label}
                    </TableSortLabel>
                  ) : (
                    column.label
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        </TableHead>
        <TableBody>
          {data.map((row, index) => {
            // Use row.id if available, otherwise use index as fallback
            const rowId = row.id !== undefined && row.id !== null ? row.id : index;
            const isRowSelected = isSelected(rowId);
            
            return (
              <TableRow
                key={rowId}
                hover
                selected={isRowSelected}
                onClick={() => onRowClick && onRowClick(row, index)}
                sx={{
                  cursor: onRowClick ? 'pointer' : 'default',
                  '&:nth-of-type(odd)': {
                    backgroundColor: theme.palette.mode === 'light' ? '#fafafa' : '#2a2a2a',
                  },
                  '&:hover': {
                    backgroundColor: theme.palette.mode === 'light' ? '#f0f0f0' : '#333',
                  },
                }}
              >
                {selectable && (
                  <TableCell
                    padding={fitWidth ? 'none' : 'checkbox'}
                    sx={fitWidth ? fitCheckboxColSx : undefined}
                  >
                    <Checkbox
                      checked={isRowSelected}
                      onChange={(e) => handleSelectRow(rowId, e)}
                      onClick={(e) => e.stopPropagation()}
                      size="small"
                      disableRipple
                      sx={{ p: 0.5, m: 0 }}
                      inputProps={{ 'aria-label': `select row ${index + 1}` }}
                    />
                  </TableCell>
                )}
                {showIndexColumn && (
                  <TableCell
                    align="center"
                    sx={{
                      color: 'text.secondary',
                      fontSize: '0.85rem',
                      fontWeight: 500,
                      ...(fitWidth ? fitIndexColSx : {}),
                      ...(isMobile && {
                        fontSize: '0.75rem',
                        padding: '8px 4px',
                      }),
                    }}
                  >
                    {rowOffset + index + 1}
                  </TableCell>
                )}
                {visibleColumns.map((column) => (
                  <TableCell
                    key={column.id}
                    align={column.align || 'left'}
                    sx={{
                      ...(fitWidth && column.width
                        ? {
                            width: column.width,
                            minWidth: column.minWidth ?? 0,
                            ...fitCell,
                          }
                        : fitWidth
                          ? fitCell
                          : {}),
                      ...(isMobile && !fitWidth && {
                        fontSize: '0.75rem',
                        padding: '8px 4px',
                      }),
                      ...(column.paddingRight != null ? { paddingRight: column.paddingRight } : {}),
                    }}
                  >
                    {getCellValue(row, column)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export default ResponsiveTable;
