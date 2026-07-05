import React, { useState } from "react";
import { Row, Col, Card, Button, Form, Table, Badge } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";

const SUMMARY_CARDS = [
  { label: "Total Revenue", value: "$0.00", color: "#4171F5", note: "This period" },
  { label: "Total Invoices", value: "0", color: "#10b981", note: "Generated" },
  { label: "Outstanding", value: "$0.00", color: "#f59e0b", note: "Unpaid" },
  { label: "Leads Converted", value: "0", color: "#8b5cf6", note: "This period" },
];

const FinancialReportPage = () => {
  const [dateRange, setDateRange] = useState([]);

  return (
    <ReportPageShell
      title="Financial & Lead Gen Report"
      subtitle="Revenue, lead generation, and financial overview by period"
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
            <div style={{ minWidth: 220 }}>
              <Flatpickr
                options={{ mode: "range", dateFormat: "M j, Y" }}
                value={dateRange}
                onChange={setDateRange}
                placeholder="Select date range"
                className="form-control form-control-sm"
                style={{ fontSize: 13, borderRadius: 8 }}
              />
            </div>
            <Form.Select size="sm" style={{ maxWidth: 160, fontSize: 13, borderRadius: 8 }}>
              <option value="">All Customers</option>
            </Form.Select>
            <Button size="sm" variant="primary" style={{ borderRadius: 8, fontSize: 13 }}>
              Apply
            </Button>
            <Button size="sm" variant="outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>
              Reset
            </Button>
          </div>
        </Card.Body>
      </Card>

      {/* Summary cards */}
      <Row className="g-3 mb-4">
        {SUMMARY_CARDS.map((card) => (
          <Col xl={3} md={6} key={card.label}>
            <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <Card.Body className="p-4">
                <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {card.label}
                </p>
                <h3 style={{ fontWeight: 700, color: card.color, margin: 0, fontSize: 26 }}>
                  {card.value}
                </h3>
                <p style={{ fontSize: 12, color: "#94a3b8", margin: "4px 0 0" }}>{card.note}</p>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* Data table */}
      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Report Data</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Date</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Customer</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Invoice #</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Job Type</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Amount</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={6} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                    No data available. Select a date range and apply filters to generate the report.
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

export default FinancialReportPage;
