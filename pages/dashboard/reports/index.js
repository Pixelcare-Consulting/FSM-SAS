import React from "react";
import Link from "next/link";
import { Container, Row, Col } from "react-bootstrap";
import { DashboardHeader } from "sub-components";
import {
  FaChartLine,
  FaWpforms,
  FaSearch,
  FaClock,
  FaFileAlt,
  FaStore,
  FaTags,
  FaThList,
  FaWarehouse,
  FaTools,
} from "react-icons/fa";

/** Jobs, forms, and performance trends */
const FIELD_SERVICE_SECTIONS = [
  {
    id: "field-jobs",
    title: "Jobs & field data",
    icon: FaChartLine,
    color: "#3DAAF5",
    items: [
      {
        label: "Forms Report",
        href: "/dashboard/reports/forms",
        icon: FaWpforms,
        description: "Submitted forms and field data summary",
      },
      {
        label: "Job Status Record Search",
        href: "/dashboard/reports/job-status",
        icon: FaSearch,
        description: "Search and filter job records by status",
      },
      {
        label: "Monthly Charts",
        href: "/dashboard/reports/monthly-charts",
        icon: FaChartLine,
        description: "Jobs, revenue, technician productivity, and job types by month",
      },
    ],
  },
];

const PAYROLL_SECTION = {
  id: "technician-time",
  title: "Technician time",
  icon: FaClock,
  color: "#8b5cf6",
  subsections: [
    {
      label: "Hours worked by employee",
      base: "/dashboard/reports/hours-by-employee",
      periods: [
        { label: "Last two weeks", query: "period=last-two-weeks" },
        { label: "Last week", query: "period=last-week" },
        { label: "This week", query: "period=this-week" },
        { label: "Custom", query: "period=custom" },
      ],
    },
  ],
};

/** SAP-style reference lists (still useful for quoting and job setup) */
const CATALOG_SECTION = {
  id: "catalog",
  title: "Catalog & master lists",
  icon: FaFileAlt,
  color: "#64748b",
  items: [
    // {
    //   label: "Vendor list",
    //   href: "/dashboard/reports/vendor-list",
    //   icon: FaStore,
    //   description: "Suppliers and vendor records",
    // },
    // {
    //   label: "Products & services catalog",
    //   href: "/dashboard/reports/products-services",
    //   icon: FaTags,
    //   description: "Items and services from SAP",
    // },
    {
      label: "Job categories",
      href: "/dashboard/reports/job-categories",
      icon: FaThList,
      description: "Job type and category codes",
    },
    // {
    //   label: "Product categories",
    //   href: "/dashboard/reports/product-categories",
    //   icon: FaTags,
    //   description: "Product grouping for inventory",
    // },
    // {
    //   label: "Warehouse list",
    //   href: "/dashboard/reports/warehouse-list",
    //   icon: FaWarehouse,
    //   description: "Warehouses and locations",
    // },
    // {
    //   label: "Equipment manufacturers",
    //   href: "/dashboard/reports/equipment-manufacturers",
    //   icon: FaTools,
    //   description: "Manufacturer reference data",
    // },
  ],
};

const ReportSectionCard = ({ section }) => {
  const Icon = section.icon;
  return (
    <div className="mb-5 report-section-block">
      <div className="d-flex align-items-center mb-3">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `${section.color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Icon style={{ color: section.color, fontSize: 18 }} />
        </div>
        <h5
          style={{
            fontWeight: 700,
            fontSize: 17,
            color: "#1e293b",
            margin: 0,
          }}
        >
          {section.title}
        </h5>
      </div>
      <div className="d-flex flex-column gap-1">
        {section.items.map((item) => {
          const ItemIcon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.description}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                color: "#4171F5",
                fontSize: 14,
                fontWeight: 500,
                textDecoration: "none",
                padding: "6px 10px",
                borderRadius: 6,
                transition: "background 0.15s",
              }}
              className="report-link"
            >
              <ItemIcon style={{ fontSize: 13, opacity: 0.7 }} />
              <span>
                {item.label}
                {item.description ? (
                  <span
                    className="d-none d-md-inline text-muted fw-normal"
                    style={{ fontSize: 12, marginLeft: 6 }}
                  >
                    — {item.description}
                  </span>
                ) : null}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

const PayrollSectionCard = ({ section }) => {
  const Icon = section.icon;
  return (
    <div className="mb-5 report-section-block">
      <div className="d-flex align-items-center mb-3">
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: `${section.color}18`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: 12,
          }}
        >
          <Icon style={{ color: section.color, fontSize: 18 }} />
        </div>
        <h5
          style={{
            fontWeight: 700,
            fontSize: 17,
            color: "#1e293b",
            margin: 0,
          }}
        >
          {section.title}
        </h5>
      </div>
      {section.subsections.map((sub) => (
        <div key={sub.label} className="mb-3">
          <p
            style={{
              fontWeight: 600,
              fontSize: 13,
              color: "#475569",
              marginBottom: 6,
              paddingLeft: 10,
            }}
          >
            {sub.label}
          </p>
          <div className="d-flex flex-wrap gap-1 ps-2 align-items-center">
            {sub.periods.map((period, idx) => (
              <React.Fragment key={period.query}>
                <Link
                  href={`${sub.base}?${period.query}`}
                  title={`Open ${sub.label} — ${period.label}`}
                  style={{
                    color: "#4171F5",
                    fontSize: 13,
                    fontWeight: 500,
                    textDecoration: "none",
                    padding: "4px 8px",
                    borderRadius: 4,
                    transition: "background 0.15s",
                  }}
                  className="report-link"
                >
                  {period.label}
                </Link>
                {idx < sub.periods.length - 1 && (
                  <span style={{ color: "#cbd5e1", alignSelf: "center" }}>|</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const ReportsPage = () => {
  return (
    <>
      <style>{`
        .report-link:hover {
          background: #f1f5f9 !important;
          color: #2563eb !important;
        }
        .reports-panel {
          background: #fff;
          border-radius: 12px;
          border: 1px solid #e2e8f0;
          padding: 28px 32px;
          height: 100%;
        }
        .reports-panel .report-section-block:last-child {
          margin-bottom: 0 !important;
        }
      `}</style>

      <DashboardHeader
        title="Reports"
        subtitle="Jobs, technician time, charts, and catalog lists — hover a link for a short summary"
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Reports" },
        ]}
      />

      <Container fluid className="mb-6">
        <Row className="g-4">
          <Col xl={6} lg={6} md={12}>
            <div className="reports-panel">
              {FIELD_SERVICE_SECTIONS.map((section) => (
                <ReportSectionCard key={section.id} section={section} />
              ))}
              <PayrollSectionCard section={PAYROLL_SECTION} />
            </div>
          </Col>
          <Col xl={6} lg={6} md={12}>
            <div className="reports-panel">
              <ReportSectionCard section={CATALOG_SECTION} />
            </div>
          </Col>
        </Row>
      </Container>
    </>
  );
};

export default ReportsPage;
