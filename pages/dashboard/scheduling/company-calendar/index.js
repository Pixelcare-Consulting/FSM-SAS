import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { GeeksSEO } from "widgets";
import { DashboardHeader } from "sub-components";
import CompanyCalendarView from "./_components/CompanyCalendarView";

const CompanyCalendarPage = () => {
  return (
    <>
      <GeeksSEO title="Company Calendar" />
      <Container fluid className="px-3 px-lg-4 pb-4">
        <DashboardHeader
          title="Company Calendar"
          description="Company holidays, day-offs, and technician leave"
          breadcrumbs={[
            { label: "Home", href: "/dashboard" },
            { label: "Scheduling", href: "/scheduler" },
            { label: "Company Calendar" },
          ]}
        />
        <Row>
          <Col xs={12}>
            <CompanyCalendarView />
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default CompanyCalendarPage;
