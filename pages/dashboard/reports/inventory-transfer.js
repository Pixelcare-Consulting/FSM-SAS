import React, { useState } from "react";
import { Row, Col, Card, Button, Form, Table, Badge } from "react-bootstrap";
import ReportPageShell from "./_components/ReportPageShell";
import { FaDownload, FaFilter } from "react-icons/fa";
import Flatpickr from "react-flatpickr";
import "flatpickr/dist/themes/light.css";

const InventoryTransferPage = () => {
  const [dateRange, setDateRange] = useState([]);

  return (
    <ReportPageShell
      title="Inventory Transfer History"
      subtitle="History of all inventory movements and warehouse transfers"
      headerRight={
        <Button size="sm" variant="light" className="d-flex align-items-center gap-2" style={{ fontSize: 13, borderRadius: 8 }}>
          <FaDownload style={{ fontSize: 12 }} />
          Export
        </Button>
      }
    >
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
              <option value="">From Warehouse</option>
            </Form.Select>
            <Form.Select size="sm" style={{ maxWidth: 160, fontSize: 13, borderRadius: 8 }}>
              <option value="">To Warehouse</option>
            </Form.Select>
            <Button size="sm" variant="primary" style={{ borderRadius: 8, fontSize: 13 }}>Apply</Button>
            <Button size="sm" variant="outline-secondary" style={{ borderRadius: 8, fontSize: 13 }}>Reset</Button>
          </div>
        </Card.Body>
      </Card>

      <Card style={{ borderRadius: 12, border: "1px solid #e2e8f0" }}>
        <Card.Header className="bg-white py-3 px-4" style={{ borderBottom: "1px solid #e2e8f0", borderRadius: "12px 12px 0 0" }}>
          <h6 style={{ fontWeight: 700, margin: 0, color: "#1e293b" }}>Transfer History</h6>
        </Card.Header>
        <Card.Body className="p-0">
          <div className="table-responsive">
            <Table hover className="mb-0" style={{ fontSize: 13 }}>
              <thead style={{ background: "#f8fafc" }}>
                <tr>
                  <th className="px-4 py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Date</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Transfer #</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Item</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Qty</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>From</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>To</th>
                  <th className="py-3" style={{ fontWeight: 600, color: "#475569", borderBottom: "1px solid #e2e8f0" }}>Transferred By</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="px-4 py-5 text-center" style={{ color: "#94a3b8", fontSize: 14 }}>
                    No transfer records found. Select a date range to load history.
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

export default InventoryTransferPage;
