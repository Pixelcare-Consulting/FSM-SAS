import React, { useState, useEffect } from 'react';
import {
  Container,
  Row,
  Col,
  Card,
  Tabs,
  Tab,
  Breadcrumb,
  Button,
  Spinner,
  Badge
} from 'react-bootstrap';
import { useRouter } from 'next/router';
import { GeeksSEO } from 'widgets';
import { AccountInfoTab } from 'sub-components/customer/AccountInfoTab';
import { ServiceLocationTab } from 'sub-components/customer/ServiceLocationTab';
import EquipmentsTab from 'sub-components/customer/EquipmentsTab';
import { DocumentsTab } from 'sub-components/customer/DocumentsTab';
import { HistoryTab } from 'sub-components/customer/HistoryTab';
import { NotesTab } from 'sub-components/customer/NotesTab';
import QuotationsTab from 'sub-components/customer/QuotationsTab';
import Link from 'next/link';

const ViewCustomer = () => {
  const [activeTab, setActiveTab] = useState('accountInfo');
  const [customerData, setCustomerData] = useState(null);
  const [equipments, setEquipments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const router = useRouter();
  const { id } = router.query;

  const isPortalCustomerNotSyncedError = (customerId, errorMessage) => {
    if (!customerId || typeof customerId !== 'string' || !errorMessage) return false;
    const normalizedId = customerId.toUpperCase();
    const message = String(errorMessage);

    return /^CP\d+$/i.test(normalizedId) && (
      message.includes('Error fetching BusinessPartner') ||
      message.includes('No matching records found') ||
      message.includes('Customer with CardCode') ||
      message.includes('not found') ||
      message.includes('BusinessPartner')
    );
  };
  
  useEffect(() => {
    // Wait for router to be ready
    if (!router.isReady) return;

    const fetchCustomerData = async () => {
      console.log('Current ID:', id);
      if (!id || id === '[id]') {
        console.log('Skipping fetch - invalid ID');
        return;
      }

      setLoading(true);
      try {
        const [customerResponse, equipmentResponse] = await Promise.all([
          fetch(`/api/getCustomerCode?cardCode=${encodeURIComponent(id)}`),
          fetch('/api/getEquipments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ cardCode: id })
          })
        ]);

        if (!customerResponse.ok) {
          throw new Error(`Failed to fetch customer details: ${await customerResponse.text()}`);
        }

        const [customerInfo, equipmentData] = await Promise.all([
          customerResponse.json(),
          equipmentResponse.ok ? equipmentResponse.json() : []
        ]);

        setCustomerData(customerInfo);
        setEquipments(equipmentData);
      } catch (error) {
        console.error('Error fetching data:', error);
        setError(error.message || 'Failed to load data.');
      } finally {
        setLoading(false);
      }
    };

    fetchCustomerData();
  }, [router.isReady, id]); // Add router.isReady to dependencies

  useEffect(() => {
    if (!router.isReady) return;
    if (!error || !isPortalCustomerNotSyncedError(id, error)) return;

    const redirectTimer = window.setTimeout(() => {
      router.replace({
        pathname: '/customer-leads',
        query: {
          openCustomerCode: id,
          portalNotSynced: '1',
        },
      });
    }, 1200);

    return () => window.clearTimeout(redirectTimer);
  }, [router, id, error]);

  const handleTabChange = (key) => {
    if (key) setActiveTab(key);
  };

  if (loading) {
    return (
      <Container>
        <Row>
          <Col lg={12} md={12} sm={12}>
            <div
              style={{
                background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
                padding: "1.5rem 2rem",
                borderRadius: "0 0 24px 24px",
                marginTop: "-39px",
                marginLeft: "10px",
                marginRight: "10px",
                marginBottom: "20px",
              }}
            >
              <div className="d-flex justify-content-between align-items-start">
                <div className="d-flex flex-column">
                  <div className="mb-3">
                    <h1
                      className="mb-2"
                      style={{
                        fontSize: "28px",
                        fontWeight: "600",
                        color: "#FFFFFF",
                        letterSpacing: "-0.02em",
                      }}
                    >
                      Loading...
                    </h1>
                    <p
                      className="mb-2"
                      style={{
                        fontSize: "16px",
                        color: "rgba(255, 255, 255, 0.7)",
                        fontWeight: "400",
                        lineHeight: "1.5",
                      }}
                    >
                      View and manage customer details, equipment, and history
                    </p>
                  </div>

                  <nav
                    style={{
                      fontSize: "14px",
                      fontWeight: "500",
                    }}
                  >
                    <div className="d-flex align-items-center">
                      <i
                        className="fe fe-home"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      ></i>
                      <Link
                        href="/"
                        className="text-decoration-none ms-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Dashboard
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <Link
                        href="/customers"
                        className="text-decoration-none"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        Loading...
                      </Link>
                      <span
                        className="mx-2"
                        style={{ color: "rgba(255, 255, 255, 0.7)" }}
                      >
                        /
                      </span>
                      <span style={{ color: "#FFFFFF" }}>Loading...</span>
                    </div>
                  </nav>
                </div>
              </div>
            </div>
          </Col>
        </Row>
        <Row>
          <Col>
            <Card className="text-center shadow-sm">
              <Card.Body>
                <Spinner animation="border" role="status" variant="primary" style={{ width: '3rem', height: '3rem' }}>
                  <span className="visually-hidden">Loading...</span>
                </Spinner>
                <p className="mt-3">Loading customer data...</p>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (error) {
    const isLeadNotSynced =
      (id &&
        typeof id === 'string' &&
        id.toUpperCase().startsWith('LEAD-') &&
        (error.includes('CardCode') ||
          error.includes('Value too long') ||
          error.includes('BusinessPartner') ||
          error.includes('not found'))) ||
      isPortalCustomerNotSyncedError(id, error);

    return (
      <Container className="mt-5">
        <Row>
          <Col>
            <Card className="text-center shadow-sm">
              <Card.Body className="py-5">
                <Card.Title className="text-danger mb-3">
                  {isLeadNotSynced ? 'Customer Not Synced to SAP Yet' : 'Error Loading Customer'}
                </Card.Title>
                <Card.Text className="mb-4">
                  {isLeadNotSynced ? (
                    <>
                      This customer is a portal or lead record that has not been synced to SAP yet.
                      Redirecting you to Customer Leads so you can view the record there.
                      {id && (
                        <>
                          <br />
                          <span className="d-inline-block mt-3 px-3 py-2 bg-light rounded">
                            <strong>Customer Code:</strong>{' '}
                            <code className="text-dark">{id}</code>
                          </span>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {error}
                      {id && (
                        <>
                          <br />
                          <small className="text-muted">Customer ID: {id}</small>
                        </>
                      )}
                    </>
                  )}
                </Card.Text>
                <div className="d-flex gap-2 justify-content-center flex-wrap">
                  <Button variant="primary" onClick={() => router.push('/customers')}>
                    Back to Customers List
                  </Button>
                  {isLeadNotSynced ? (
                    <Button
                      variant="outline-primary"
                      onClick={() =>
                        router.push({
                          pathname: '/customer-leads',
                          query: {
                            openCustomerCode: id,
                            portalNotSynced: '1',
                          },
                        })
                      }
                    >
                      Open in Customer Leads
                    </Button>
                  ) : (
                    <Button variant="outline-primary" onClick={() => router.push('/customer-leads')}>
                      Go to Customer Leads
                    </Button>
                  )}
                  {!isLeadNotSynced && (
                    <Button variant="secondary" onClick={() => window.location.reload()}>
                      Retry Loading
                    </Button>
                  )}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  if (!customerData) {
    return (
      <Container className="mt-5">
        <Row>
          <Col>
            <Card className="text-center">
              <Card.Body>
                <Card.Title>No Data Found</Card.Title>
                <Card.Text>No customer data found for the given ID.</Card.Text>
                <Button variant="primary" onClick={() => router.push('/customers')}>
                  Back to Customers List
                </Button>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <GeeksSEO title={`View Customer: ${customerData.cardName || ''} | FSM Portal`} />
      <Row>
        <Col lg={12} md={12} sm={12}>
          <div
            style={{
              background: "linear-gradient(90deg, #4171F5 0%, #3DAAF5 100%)",
              padding: "1.5rem 2rem",
              borderRadius: "0 0 24px 24px",
              marginTop: "-39px",
              marginLeft: "10px",
              marginRight: "10px",
              marginBottom: "20px",
            }}
          >
            <div className="d-flex justify-content-between align-items-start">
              <div className="d-flex flex-column">
                <div className="mb-3">
                  <h1
                    className="mb-2"
                    style={{
                      fontSize: "28px",
                      fontWeight: "600",
                      color: "#FFFFFF",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {customerData?.CardName}
                  </h1>
                  <p
                    className="mb-2"
                    style={{
                      fontSize: "16px",
                      color: "rgba(255, 255, 255, 0.7)",
                      fontWeight: "400",
                      lineHeight: "1.5",
                    }}
                  >
                    View and manage customer details, equipment, and history
                  </p>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-light text-dark">
                      ID: {customerData?.CardCode}
                    </span>
                    {customerData?.CustomerType && (
                      <Badge bg="secondary">
                        {customerData.CustomerType}
                      </Badge>
                    )}
                  </div>
                </div>

                <nav
                  style={{
                    fontSize: "14px",
                    fontWeight: "500",
                  }}
                >
                  <div className="d-flex align-items-center">
                    <i
                      className="fe fe-home"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    ></i>
                    <Link
                      href="/"
                      className="text-decoration-none ms-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Dashboard
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <Link
                      href="/customers"
                      className="text-decoration-none"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      Customers
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <span style={{ color: "#FFFFFF" }}>Customer Details</span>
                  </div>
                </nav>
              </div>

              <div>
                <Button
                  variant="light"
                  className="d-flex align-items-center gap-2"
                  style={{
                    padding: "0.5rem 1rem",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                  onClick={() => router.push('/customers')}
                >
                  <i className="fe fe-arrow-left"></i>
                  Back to Customers
                </Button>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <Row>
        <Col xl={12} lg={12} md={12} sm={12}>
          <Card className="shadow-sm">
            <Card.Body>
              <Tabs
                activeKey={activeTab}
                onSelect={handleTabChange}
                className="mb-3"
              >
                <Tab eventKey="accountInfo" title="Account Info">
                  <AccountInfoTab customerData={customerData} />
                </Tab>
                <Tab eventKey="serviceLocation" title="Address">
                  <ServiceLocationTab customerData={customerData} />
                </Tab>
                <Tab eventKey="notes" title="Notes">
                  <NotesTab customerId={id} />
                </Tab>
                <Tab eventKey="equipments" title="Equipments">
                    <EquipmentsTab customerData={customerData} equipments={equipments} />
                </Tab>
                <Tab eventKey="history" title="Job History">
                  <HistoryTab customerData={customerData} customerID={id} />
                </Tab>
                <Tab eventKey="quotations" title="Quotations">
                  <QuotationsTab customerId={id} />
                </Tab>
                
                <Tab eventKey="documents" title="Documents">
                  <DocumentsTab customerData={customerData} />
                </Tab>
              </Tabs>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ViewCustomer;
