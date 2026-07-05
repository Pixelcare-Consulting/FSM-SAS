import React, { useState } from "react";
import { Row, Col, Card, Button, Form, Table, Badge } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter, FaCar, FaTools } from "react-icons/fa";

const FLEET_TABS = ["All", "Vehicles", "Equipment"];

const FleetPage = () => {
  const [activeTab, setActiveTab] = useState("All");
  const [search, setSearch] = useState("");

  return (
    <ReportPageShell
      title="Co Fleet & Equipment Management"
      subtitle="Company fleet vehicles and equipment records, assignments, and service history"
      headerRight={
        <Button size="sm" variant="light" className="d-flex align-items-center gap-2" style={{ fontSize: 13, borderRadius: 8 }}>
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
      {/* Tabs */}
      <div className="d-flex gap-2 mb-4">
        {FLEET_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={activeTab === tab ? "primary" : "outline-secondary"}
            onClick={() => setActiveTab(tab)}
            style={{ borderRadius: 20, fontSize: 12, padding: "5px 16px" }}
          >
            {tab === "Vehicles" && <FaCar className="me-1" style={{ fontSize: 11 }} />}
            {tab === "Equipment" && <FaTools className="me-1" style={{ fontSize: 11 }} />}
            {tab}
          </Button>
        ))}
      </div>

      {/* Summary */}
      <Row className="g-3 mb-4">
        {[
          { label: "Total Vehicles", value: "0", color: "#4171F5", icon: FaCar },
          { label: "Total Equipment", value: "0", color: "#10b981", icon: FaTools },
          { label: "In Service", value: "0", color: "#f59e0b" },
          { label: "Needs Maintenance", value: "0", color: "#ef4444" },
        ].map((c) => (
          <Col xl={3} md={6} key={c.label}>
            <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <Card.Body className="p-4">
                <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{c.label}</p>
                <h3 style={{ fontWeight: 700, color: c.color, margin: 0, fontSize: 26 }}>{c.value}</h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Filters */}
      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <FaFilter style={{ color: "#94a3b8", fontSize: 14 }} />
            <Form.Control
              size="sm"
              placeholder="Search by name, plate, or serial..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 240, fontSize: 13, borderRadius: 8 }}
            />
            <Form.Select size="sm" style={{ maxWidth: 160, fontSize: 13, borderRadius: 8 }}>
              <option value="">All Statuses</option>
              <option>Active</option>
              <option>In Service</option>
              <option>Needs Maintenance</option>
              <option>Retired</option>
            </Form.Select>
            <Button size="sm" variant="primary" style={{ borderRadius: 8, fontSize: 13 }}>Apply</Button>
            <Button size="sm" variant="outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>Reset</Button>
          </div>
        </Card.Body>
      </Card>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>
            {activeTab === "All" ? "Fleet & Equipment" : activeTab}
          </h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Name / ID</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Type</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Plate / Serial</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Assigned To</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Last Service</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                    No fleet or equipment records found.
                  </td>
                </tr>
              </tbody>
            </Table>
          </div>
        </Card.Body>
      </Card>
    </ReportPageShell>
  );
};

export default FleetPage;
