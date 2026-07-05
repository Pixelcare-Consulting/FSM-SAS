import React, { Fragment } from 'react';
import dynamic from 'next/dynamic';
import { Row, Col } from 'react-bootstrap';
import Link from 'next/link';
import { GeeksSEO } from 'widgets';
import DefaultDashboardLayout from 'layouts/dashboard/DashboardIndexTop';

const AifmJobsPreview = dynamic(
  () => import('./_components/AifmJobsPreview'),
  { ssr: false, loading: () => <div className="text-center py-5">Loading…</div> }
);

const AifmJobsPage = () => {
  return (
    <Fragment>
      <GeeksSEO title="AIFM jobs preview | SAS&ME Portal" />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div
            style={{
              background: 'linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)',
              padding: '1.5rem 2rem',
              borderRadius: '0 0 24px 24px',
              marginTop: '-39px',
              marginLeft: '10px',
              marginRight: '10px',
              marginBottom: '20px'
            }}
          >
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
              <div className="d-flex flex-column">
                <h1
                  className="mb-2"
                  style={{
                    fontSize: '28px',
                    fontWeight: '600',
                    color: '#FFFFFF',
                    letterSpacing: '-0.02em'
                  }}
                >
                  AIFM jobs preview
                </h1>
                <p
                  className="mb-2"
                  style={{
                    fontSize: '16px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontWeight: '400',
                    lineHeight: '1.5'
                  }}
                >
                  Fetch job lists from AI Field Management Open API for inspection. 
                </p>
                <nav style={{ fontSize: '14px', fontWeight: '500' }}>
                  <div className="d-flex align-items-center flex-wrap">
                    <i className="fe fe-home" style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                    <Link
                      href="/dashboard"
                      className="text-decoration-none ms-2"
                      style={{ color: 'rgba(255, 255, 255, 0.7)' }}
                    >
                      Dashboard
                    </Link>
                    <span className="mx-2" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                      /
                    </span>
                    <span className="ms-0" style={{ color: '#FFFFFF' }}>
                      AIFM jobs preview
                    </span>
                  </div>
                </nav>
              </div>
            </div>
          </div>
        </Col>
      </Row>
      <Row>
        <Col md={12} xs={12} className="mb-5">
          <AifmJobsPreview />
        </Col>
      </Row>
    </Fragment>
  );
};

AifmJobsPage.Layout = DefaultDashboardLayout;
export default AifmJobsPage;
