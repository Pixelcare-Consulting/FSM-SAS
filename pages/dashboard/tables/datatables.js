// import node module libraries
import React, { Fragment, useMemo, useState, useEffect } from 'react';
import { Col, Row, Breadcrumb, Card, Button } from 'react-bootstrap';
import DataTable from 'react-data-table-component';

// import sub components
import { Pagination } from 'sub-components';

// import data files
import EmployeeData from 'data/dashboard/tables/EmployeeData';

// import utility file
import { convertToCurrency } from 'helper/utils';

const Datatables = () => {

  //  Internally, customStyles will deep merges your customStyles with the default styling.
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
    { name: 'Name', selector: row => row.fullname, sortable: true },
    { name: 'Position', selector: row => row.position, sortable: true },
    { name: 'Office', selector: row => row.office, sortable: true },
    { name: 'Age', selector: row => row.age, sortable: true },
    { name: 'Start Date', selector: row => row.start_date, sortable: true },
    { name: 'Salary', selector: row => convertToCurrency(row.salary), sortable: true },
  ];

  // Filter code started
  const [data, setData] = useState(EmployeeData);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState(EmployeeData);

  useEffect(() => {
    const result = data.filter(item => {
      return (item.fullname.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.position.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.office.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.age === parseInt(search))
        || (item.start_date.toLowerCase().match(search.toLocaleLowerCase()))
        || (item.salary === parseInt(search));
    });
    setFilter(result);
  }, [search, data]);

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

  const ActionButtons = () => {
    return (
      <Fragment>
        <Button variant='light'>Excel</Button>
        <Button variant='light'>CSV</Button>
        <Button variant='light'>Print</Button>
      </Fragment>
    )
  }
  const actionsMemo = React.useMemo(() => <ActionButtons />, []);

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
        <Col lg={12} md={12} sm={12}>
          <div className="border-bottom pb-4 mb-4 d-md-flex align-items-center justify-content-between">
            <div className="mb-3 mb-md-0">
              <h1 className="mb-1 h2 fw-bold">Data Tables</h1>
              <Breadcrumb>
                <Breadcrumb.Item href="#">Dashboard</Breadcrumb.Item>
                <Breadcrumb.Item href="#">Tables</Breadcrumb.Item>
                <Breadcrumb.Item active>Data Tables</Breadcrumb.Item>
              </Breadcrumb>
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col md={12} xs={12} className="mb-5">
          <Card>
            <Card.Header>
              <h4 className="mb-1">Data Table Basic</h4>
              <p className="mb-0">
                DataTable displays data in tabular format. It is a highly flexible tool, built upon the foundations of progressive enhancement, that adds all of these advanced
                features to any HTML table.
              </p>
            </Card.Header>
            <Card.Body className='px-0'>
              <DataTable
                customStyles={customStyles}
                columns={columns}
                data={filter}
                pagination
                paginationComponent={Pagination}
                highlightOnHover
                subHeader
                subHeaderComponent={subHeaderComponentMemo}
                paginationRowsPerPageOptions={[3, 5, 10]}
                subHeaderAlign="left"
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md={12} xs={12} className="mb-5">
          <Card>
            <Card.Header>
              <h4 className="mb-1">Data Table With Buttons</h4>
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
                subHeaderAlign="left"
                actions={actionsMemo}
              />
            </Card.Body>
          </Card>
        </Col>
      </Row>

    </Fragment>
  );
}

export default Datatables