import React from "react";
import { Container, Row, Col } from "react-bootstrap";
import { GeeksSEO } from "widgets";
import UsersMigrationTool from "./_components/UsersMigrationTool";

export default function WorkersMigrationPage() {
  return (
    <Container>
      <GeeksSEO title="User Accounts Migration | SAS M&E - SAP B1 | Portal" />
      <Row className="mt-4">
        <Col lg={12}>
          <UsersMigrationTool />
        </Col>
      </Row>
    </Container>
  );
}
