import React, { useState } from "react";
import { Row, Col, Card, Button, Form, Table, Badge } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter, FaBoxes } from "react-icons/fa";

const SUMMARY_CARDS = [
  { label: "Total Items", value: "0", color: "#4171F5" },
  { label: "Low Stock", value: "0", color: "#ef4444" },
  { label: "Out of Stock", value: "0", color: "#f59e0b" },
  { label: "Total Value", value: "$0.00", color: "#10b981" },
];

const InventoryReportPage = () => {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");

  return (
    <ReportPageShell
      title="Inventory Report"
      subtitle="Current stock levels, item counts, and inventory valuation"
      headerRight={
        <Button
          size="sm"
          variant="light"
          className="d-flex align-items-center gap-2"
          style={{ fontSize: 13, borderRadius: 8 }}
        >
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
      {/* Filters */}
      <Card className="mb-4" style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Body className="py-3 px-4">
          <div className="d-flex align-items-center gap-3 flex-wrap">
            <FaFilter style={{ color: "#94a3b8", fontSize: 14 }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: "#475569" }}>Filters</span>
            <Form.Control
              size="sm"
              placeholder="Search item name or SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 220, fontSize: 13, borderRadius: 8 }}
            />
            <Form.Select
              size="sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              style={{ maxWidth: 180, fontSize: 13, borderRadius: 8 }}
            >
              <option value="">All Categories</option>
            </Form.Select>
            <Form.Select size="sm" style={{ maxWidth: 160, fontSize: 13, borderRadius: 8 }}>
              <option value="">All Warehouses</option>
            </Form.Select>
            <Button size="sm" variant="primary" style={{ borderRadius: 8, fontSize: 13 }}>Apply</Button>
            <Button size="sm" variant="outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>Reset</Button>
          </div>
        </Card.Body>
      </Card>

      {/* Summary */}
      <Row className="g-3 mb-4">
        {SUMMARY_CARDS.map((card) => (
          <Col xl={3} md={6} key={card.label}>
            <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <Card.Body className="p-4">
                <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {card.label}
                </p>
                <h3 style={{ fontWeight: 700, color: card.color, margin: 0, fontSize: 26 }}>{card.value}</h3>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Table */}
      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Inventory Items</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Item Name</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>SKU</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Category</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Warehouse</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Qty On Hand</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Unit Price</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                    No inventory data available. Apply filters to load items.
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

export default InventoryReportPage;
