import React from "react";
import Link from "next/link";
import { Container, Row, Col, Card } from "react-bootstrap";
import { DashboardHeader } from "sub-components";
import { FaArrowLeft, FaChartBar } from "react-icons/fa";

/**
 * Shared shell for all report sub-pages.
 * Renders the blue gradient header with breadcrumb, a back-to-reports link,
 * and a content area for the specific report.
 *
 * @param {string} title - Report title
 * @param {string} subtitle - Short description
 * @param {React.ReactNode} children - The report content
 * @param {React.ReactNode} headerRight - Optional right-side action in the header
 */
const ReportPageShell = ({ title, subtitle, children, headerRight }) => {
  return (
    <>
      <DashboardHeader
        title={title}
        subtitle={subtitle}
        breadcrumbs={[
          { label: "Home", href: "/dashboard" },
          { label: "Reports", href: "/dashboard/reports" },
          { label: title },
        ]}
        rightAction={headerRight}
      />
      <Container fluid className="mb-6">
        <div className="mb-3">
          <Link
            href="/dashboard/reports"
            className="d-inline-flex align-items-center gap-2 text-decoration-none"
            style={{ fontSize: 13, color: "#64748b", fontWeight: 500 }}
          >
            <FaArrowLeft style={{ fontSize: 11 }} />
            Back to Reports
          </Link>
        </div>
        {children}
      </Container>
    </>
  );
};

export default ReportPageShell;
