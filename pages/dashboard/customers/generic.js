import React, { Fragment } from 'react';
import dynamic from 'next/dynamic';
import { Row, Col } from 'react-bootstrap';
import DefaultDashboardLayout from 'layouts/dashboard/DashboardIndexTop';

const GenericCustomersList = dynamic(
  () => import('./generic/_components/GenericCustomersList'),
  { ssr: false, loading: () => <div className="text-center py-5">Loading...</div> }
);

const GenericCustomersPage = () => {
  return (
    <Fragment>
      <Row>
        <Col lg={12} md={12} sm={12}>
          <GenericCustomersList />
        </Col>
      </Row>
    </Fragment>
  );
};

GenericCustomersPage.Layout = DefaultDashboardLayout;
export default GenericCustomersPage;
