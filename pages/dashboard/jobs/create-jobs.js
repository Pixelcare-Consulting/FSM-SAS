import { Row, Col, Container, Card } from 'react-bootstrap';
import { GeeksSEO } from 'widgets'
import AddNewJobs from 'sub-components/dashboard/jobs/CreateJobs';
import toast from 'react-hot-toast';
import Link from 'next/link';

// Validation helper function
const validateJobForm = (formData) => {
  const requiredFields = {
    // Basic Job Info
    jobName: 'Job Name',
    jobDescription: 'Job Description',
    priority: 'Priority Level',
    
    // Scheduling
    startDate: 'Start Date',
    endDate: 'End Date',
    startTime: 'Start Time',
    endTime: 'End Time',
    
    // Customer Info
    customerID: 'Customer',
    
    // Location
    'location.locationName': 'Location Name',
    'location.address.streetAddress': 'Street Address',
    
    // Contact
    'jobContactType.code': 'Job Contact Type',

  };

  const missingFields = [];
  
  // Check regular fields
  Object.entries(requiredFields).forEach(([field, label]) => {
    const value = field.includes('.') ? 
      field.split('.').reduce((obj, key) => obj?.[key], formData) : 
      formData[field];
      
    if (!value || (Array.isArray(value) && value.length === 0)) {
      missingFields.push(label);
    }
  });

  // Special validation for tasks
  if (formData.taskList && formData.taskList.length === 0) {
    missingFields.push('Please add at least 1 task to proceed');
  } else if (formData.taskList) {
    formData.taskList.forEach((task, index) => {
      if (!task.taskName?.trim()) {
        missingFields.push(`Task ${index + 1}: Task Name is required`);
      }
      if (!task.assignedTo) {
        missingFields.push(`Task ${index + 1}: Assigned Worker is required`);
      }
    });
  }

  return missingFields;
};

const CreateJobs = () => {
  return (
    <Container>
      <GeeksSEO title="Create Job | SAS&ME - SAP B1 | Portal" />
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
                    Create New Job
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
                    Streamline your workflow by creating detailed job assignments with tasks, schedules, and assigned workers.
                  </p>
                  <div
                    className="d-flex align-items-center gap-2"
                    style={{
                      fontSize: "14px",
                      color: "rgba(255, 255, 255, 0.9)",
                      background: "rgba(255, 255, 255, 0.1)",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      marginTop: "8px",
                    }}
                  >
                    <i className="fe fe-info" style={{ fontSize: "16px" }}></i>
                    <span>
                      Complete all required fields including job details, scheduling, and worker assignments
                    </span>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2 mb-4">
                  <span
                    className="badge"
                    style={{
                      background: "#FFFFFF",
                      color: "#4171F5",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    Job Management
                  </span>
                  <span
                    className="badge"
                    style={{
                      background: "rgba(255, 255, 255, 0.2)",
                      color: "#FFFFFF",
                      padding: "6px 12px",
                      borderRadius: "6px",
                      fontWeight: "500",
                      fontSize: "14px",
                    }}
                  >
                    <i className="fe fe-briefcase me-1"></i>
                    New Job
                  </span>
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
                      href="/jobs"
                      className="text-decoration-none d-flex align-items-center"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      <i className="fe fe-briefcase me-1"></i>
                      Jobs
                    </Link>
                    <span
                      className="mx-2"
                      style={{ color: "rgba(255, 255, 255, 0.7)" }}
                    >
                      /
                    </span>
                    <span style={{ color: "#FFFFFF" }}>
                      <i className="fe fe-plus-circle me-1"></i>
                      Create Job
                    </span>
                  </div>
                </nav>
              </div>

              <div>
                <Link 
                  href="/jobs"
                  className="btn btn-light btn-sm d-flex align-items-center gap-2"
                  style={{
                    border: "none",
                    borderRadius: "12px",
                    padding: "10px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    transition: "all 0.2s ease",
                    fontWeight: "500",
                    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                  }}
                >
                  <i className="fe fe-arrow-left"></i>
                  Back to Jobs
                </Link>
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <div className="border-bottom pb-1 mb-4 d-flex align-items-center justify-content-between">
           
      </div>  
      <Col xl={12} lg={12} md={12} sm={12}>
      
        <Card className="shadow-sm">
          <Card.Body>
            <AddNewJobs validateJobForm={validateJobForm} />
          </Card.Body>
        </Card>
      </Col>
      <style jsx global>{`
        .breadcrumb-link:hover {
          color: #ffffff !important;
          transform: translateY(-1px);
          text-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </Container>
  )
}

export default CreateJobs;