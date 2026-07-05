# TablePagination Component

A unified, reusable pagination component for all tables in the application.

## Features

- ✅ **Previous/Next buttons** - Easy navigation between pages
- ✅ **Manual page input** - Type page number directly (e.g., "50") instead of clicking Next many times
- ✅ **Page X of Y display** - Clear indication of current position
- ✅ **Consistent design** - Same footer design across all tables
- ✅ **Responsive** - Works on mobile, tablet, and desktop
- ✅ **Accessible** - Proper ARIA labels and keyboard support

## Usage

### Basic Example

```jsx
import TablePagination from 'components/common/TablePagination';

function MyTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = 77;
  const totalItems = 1925; // Optional

  return (
    <div>
      {/* Your table content */}
      
      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems} // Optional
        onPageChange={(newPage) => setCurrentPage(newPage)}
      />
    </div>
  );
}
```

### With Data Fetching

```jsx
import TablePagination from 'components/common/TablePagination';
import { useState, useEffect } from 'react';

function DataTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const [data, setData] = useState([]);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(false);

  const fetchData = async (page) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/data?page=${page}`);
      const result = await response.json();
      setData(result.data);
      setTotalPages(result.totalPages);
      setTotalItems(result.totalItems);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage]);

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Data will be fetched automatically via useEffect
  };

  return (
    <div>
      {/* Your table */}
      <table>
        {/* table content */}
      </table>

      <TablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalItems={totalItems}
        onPageChange={handlePageChange}
        disabled={loading}
      />
    </div>
  );
}
```

## Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `currentPage` | `number` | Yes | `1` | Current page number (1-indexed) |
| `totalPages` | `number` | Yes | `1` | Total number of pages |
| `totalItems` | `number` | No | `null` | Total number of items (for display like "1925 items, Page 1 of 77") |
| `onPageChange` | `function` | Yes | - | Callback function called when page changes. Receives new page number as argument |
| `disabled` | `boolean` | No | `false` | Disable all pagination controls |
| `className` | `string` | No | `''` | Additional CSS classes |

## Design

The component follows this design pattern:

```
[< Previous]  [Page [50] of 77]  [Next >]
```

Or with item count:

```
[< Previous]  [1925 items, Page [50] of 77]  [Next >]
```

## Integration

This component is already integrated into:
- `sub-components/dashboard/data-table/Pagination.js` - Main data table pagination
- Can be used in any table component throughout the application

## Migration Guide

To migrate existing pagination to use this component:

1. Import the component:
```jsx
import TablePagination from 'components/common/TablePagination';
```

2. Replace your existing pagination JSX with:
```jsx
<TablePagination
  currentPage={currentPage}
  totalPages={totalPages}
  totalItems={totalItems} // if available
  onPageChange={handlePageChange}
/>
```

3. Remove old pagination code and styles

## Notes

- The component automatically hides if `totalPages <= 1`
- Page input validates and constrains values between 1 and totalPages
- Enter key submits the page input
- Component is fully responsive and works on mobile devices

