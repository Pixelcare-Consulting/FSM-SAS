import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { GeeksSEO } from "widgets";
import JobsMigrationTool from "./_components/JobsMigrationTool";

export default function JobsMigrationPage() {
  return (
    <Container>
      <GeeksSEO title="Jobs Migration | SAS M&E - SAP B1 | Portal" />
      <Row className="mt-4">
        <Col lg={12}>
          <JobsMigrationTool />
        </Col>
      </Row>
    </Container>
  );
}

