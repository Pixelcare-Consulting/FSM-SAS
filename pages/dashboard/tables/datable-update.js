import React, { Fragment, useMemo, useState, useEffect } from 'react';
import { Col, Row, Card } from 'react-bootstrap';
import DataTable from 'react-data-table-component';
import { Pagination } from 'sub-components';

const EquipmentsTable = ({ equipments, onSelectedRowsChange }) => {

  const customStyles = {
    headCells: {
      style: {
        fontWeight: 'bold',
        fontSize: '14px',
        backgroundColor: "#F1F5FC"
      },
    },
    cells: {
      style: {
        color: '#64748b',
        fontSize: '14px'
      },
    },
  };

  const columns = [
    { name: 'Item Code', selector: row => row.ItemCode, sortable: true },
    { name: 'Item Name', selector: row => row.ItemName, sortable: true },
    { name: 'Item Group', selector: row => row.ItemGroup, sortable: true },
    { name: 'Model Series', selector: row => row.ModelSeries, sortable: true },
    { name: 'Serial No', selector: row => row.SerialNo, sortable: true },
    { name: 'Brand', selector: row => row.Brand, sortable: true },
    { name: 'Notes', selector: row => row.Notes, sortable: true },
    { name: 'Equipment Type', selector: row => row.EquipmentType, sortable: true },
    { name: 'Warranty Start Date', selector: row => row.WarrantyStartDate, sortable: true },
    { name: 'Warranty End Date', selector: row => row.WarrantyEndDate, sortable: true },
    { name: 'Equipment Location', selector: row => row.EquipmentLocation, sortable: true },
  ];

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(equipments);

  useEffect(() => {
    setFilter(equipments);
  }, [equipments]);

  useEffect(() => {
    const result = equipments.filter(item => {
      return (item.ItemCode.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.ItemName.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.ItemGroup.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.ModelSeries.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.SerialNo.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.Brand.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.Notes.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.EquipmentType.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.WarrantyStartDate.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.WarrantyEndDate.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.EquipmentLocation.toLowerCase().match(search.toLocaleLowerCase()));
    });
    setFilter(result);
  }, [search, equipments]);

  const subHeaderComponentMemo = useMemo(() => {
    return (
      <Fragment>
        <input type="text"
          className="form-control me-4 mb-4"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Fragment>
    );
  }, [search]);

  const BootstrapCheckbox = React.forwardRef(({ onClick, ...rest }, ref) => (
    <div className="form-check">
      <input
        htmlFor="bootstrap-check"
        type="checkbox"
        className="form-check-input"
        ref={ref}
        onClick={onClick}
        {...rest}
      />
      <label className="form-check-label" id="bootstrap-check" />
    </div>
  ));

  BootstrapCheckbox.displayName = 'BootstrapCheckbox';

  return (
    <Fragment>
      <Row>
        <Col md={12} xs={12} className="mb-5">
          <Card>
            <Card.Header>
              <h4 className="mb-1">List of Equipments</h4>
              <a>Select specific equipments for this job.</a>
            </Card.Header>
            <Card.Body className='px-0'>
              <DataTable
                customStyles={customStyles}
                columns={columns}
                data={filter}
                pagination
                paginationComponent={Pagination}
                selectableRows
                selectableRowsHighlight
                selectableRowsComponent={BootstrapCheckbox}
                highlightOnHover
                subHeader
                subHeaderComponent={subHeaderComponentMemo}
                paginationRowsPerPageOptions={[3, 5, 10]}
                // subHeaderAlign="left"
                onSelectedRowsChange={({ selectedRows }) => {
                  console.log('Selected rows:', selectedRows);
                  onSelectedRowsChange(selectedRows);
                }}
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Fragment>
  );
};

export default EquipmentsTable;
