import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Table, Form, Button } from 'react-bootstrap';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender,
  getFilteredRowModel,
} from '@tanstack/react-table';

const EquipmentsTableWithAddDelete = ({
  equipments = [],
  initialSelected = [],
  onSelectionChange,
}) => {
  const [rowSelection, setRowSelection] = useState({});
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [data, setData] = useState([]);
  const [updatedEquipments, setUpdatedEquipments] = useState([]);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (equipments.length > 0) {
      // Mark items that are from DB (initially selected)
      const preparedData = equipments.map(equipment => ({
        ...equipment,
        fromDB: initialSelected.some(dbItem => 
          dbItem.serialNo === equipment.serialNo && 
          dbItem.modelSeries === equipment.modelSeries
        )
      }));
  
      // Sort to show DB items first
      const sortedData = [
        ...preparedData.filter(item => item.fromDB),
        ...preparedData.filter(item => !item.fromDB)
      ];
  
      setData(sortedData);
  
      // Set initial selection state for DB items
      const initialSelectionState = {};
      sortedData.forEach((item, index) => {
        if (item.fromDB) {
          initialSelectionState[index] = true;
        }
      });
  
      // Debug initial state
      console.log('Initial State:', {
        data: sortedData.length,
        initialSelected: initialSelected.length,
        selectionState: initialSelectionState
      });
  
      setRowSelection(initialSelectionState);
      setUpdatedEquipments(initialSelected);
    }
  }, [equipments, initialSelected]);

  // Handle selection changes
  const handleSelectionChange = useCallback((updatedSelection) => {
    // If updatedSelection is a function, get the actual value
    const newSelection = typeof updatedSelection === 'function' 
      ? updatedSelection(rowSelection) 
      : updatedSelection;
    
    setRowSelection(newSelection);
    
    // Get currently selected equipments
    const selectedEquipments = data.filter((_, index) => newSelection[index]).map(equipment => ({
      brand: equipment.brand || equipment.Brand,
      equipmentLocation: equipment.equipmentLocation || equipment.EquipmentLocation || null,
      equipmentType: equipment.equipmentType || '',
      itemCode: equipment.itemCode || '',
      itemGroup: equipment.itemGroup || 'Equipment',
      itemName: equipment.itemName || equipment.ItemName,
      modelSeries: equipment.modelSeries,
      notes: equipment.notes || equipment.Notes || '',
      serialNo: equipment.serialNo,
      fromDB: equipment.fromDB
    }));

    // Debug the actual selection
    console.log('Actual Selection:', {
      newSelection,
      selectedEquipments,
      selectedIndices: Object.keys(newSelection).filter(key => newSelection[key])
    });

    // Separate DB items and new selections
    const selectedDBItems = selectedEquipments.filter(item => item.fromDB);
    const selectedNewItems = selectedEquipments.filter(item => !item.fromDB);

    // Calculate added and removed items
    const addedEquipments = selectedNewItems;
    const removedEquipments = initialSelected.filter(
      dbItem => !selectedDBItems.some(selected => 
        dbItem.serialNo === selected.serialNo && 
        dbItem.modelSeries === selected.modelSeries
      )
    );

    // Update the equipment list
    setUpdatedEquipments(selectedEquipments);

    onSelectionChange({
      currentSelections: selectedEquipments,
      added: addedEquipments,
      removed: removedEquipments,
      originalData: initialSelected
    });
  }, [data, initialSelected, onSelectionChange, rowSelection]);

  // Update the display counts
  const selectedCount = Object.keys(rowSelection).filter(key => rowSelection[key]).length;
  const addedCount = Object.keys(rowSelection).filter(key => rowSelection[key] && !data[key]?.fromDB).length;
  const selectedDBCount = Object.keys(rowSelection).filter(key => rowSelection[key] && data[key]?.fromDB).length;
  const removedCount = initialSelected.length - selectedDBCount;

  const columns = useMemo(() => [
    {
      id: 'select',
      header: ({ table }) => (
        <div className="px-1">
          <Form.Check
            type="checkbox"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
            ref={(input) => {
              if (input) {
                input.indeterminate = table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected();
              }
            }}
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1">
          <Form.Check
            type="checkbox"
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
            className={row.original.fromDB ? 'text-primary' : ''}
          />
        </div>
      ),
    },
    {
      header: 'Item Name',
      accessorKey: 'itemName',
      cell: ({ row }) => row.original.ItemName || row.original.itemName,
    },
    {
      header: 'Serial No',
      accessorKey: 'serialNo',
    },
    {
      header: 'Model Series',
      accessorKey: 'modelSeries',
    },
    {
      header: 'Brand',
      accessorKey: 'brand',
      cell: ({ row }) => row.original.Brand || row.original.brand,
    },
    {
      header: 'Equipment Location',
      accessorKey: 'equipmentLocation',
      cell: ({ getValue }) => getValue() || 'N/A',
    },
    {
      header: 'Notes',
      accessorKey: 'notes',
      cell: ({ row }) => row.original.Notes || row.original.notes,
    },
  ], []);

  // Table configuration
  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      globalFilter,
      rowSelection,
    },
    enableRowSelection: true,
    onRowSelectionChange: handleSelectionChange,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: {
        pageSize: 10,
      },
    },
  });


  return (
    <div className="my-4">
      <div className="mb-4">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h6 className="mb-0">
              Showing {selectedCount} selected equipment(s)
            </h6>
            <p className="text-muted small mb-0">
              Original DB items: {initialSelected.length} | Added: {addedCount} | Removed: {removedCount}
            </p>
          </div>
          <Form.Control
            type="text"
            value={globalFilter ?? ''}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search equipments..."
            className="w-auto"
          />
        </div>
      </div>

      <div className="table-responsive">
        <Table>
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th 
                    key={header.id}
                    className="text-nowrap"
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default',
                      userSelect: 'none'
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr 
                key={row.id}
                className={`
                  ${row.getIsSelected() ? 'table-primary' : ''}
                  ${row.original.fromDB ? 'border-start border-primary border-3' : ''}
                `}
              >
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext()
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <div className="d-flex justify-content-between align-items-center mt-3">
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            size="sm"
          >
            Previous
          </Button>
          <Button
            variant="outline-secondary"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            size="sm"
          >
            Next
          </Button>
        </div>
        <span className="text-muted">
          Page {table.getState().pagination.pageIndex + 1} of{' '}
          {table.getPageCount()}
        </span>
      </div>
    </div>
  );
};

export default EquipmentsTableWithAddDelete;