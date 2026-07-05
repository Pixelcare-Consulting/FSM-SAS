import React from 'react';
import { Row, Col, Table, Badge } from 'react-bootstrap';
import { History } from 'lucide-react';

export const HistoryTab = ({ customerData }) => {
  // Sample job history data
  const sampleHistory = [
    {
      id: "JOB-2024-001",
      date: "2024-03-20",
      type: "Preventive Maintenance",
      description: "Quarterly maintenance check on HVAC systems",
      technician: "John Smith",
      status: "Completed",
      location: "Main Building",
      duration: "2 hours"
    },
    {
      id: "JOB-2024-002",
      date: "2024-02-15",
      type: "Repair",
      description: "Emergency repair of malfunctioning compressor unit",
      technician: "Mike Johnson",
      status: "Completed",
      location: "Production Area",
      duration: "4 hours"
    },
    {
      id: "JOB-2024-003",
      date: "2024-01-30",
      type: "Installation",
      description: "New air conditioning unit installation",
      technician: "Sarah Wilson",
      status: "Completed",
      location: "Office Area",
      duration: "6 hours"
    },
    {
      id: "JOB-2024-004",
      date: "2024-01-15",
      type: "Inspection",
      description: "Annual system inspection and certification",
      technician: "David Brown",
      status: "Completed",
      location: "All Areas",
      duration: "8 hours"
    },
    {
      id: "JOB-2023-125",
      date: "2023-12-20",
      type: "Repair",
      description: "Filter replacement and system cleaning",
      technician: "John Smith",
      status: "Completed",
      location: "Main Building",
      duration: "3 hours"
    }
  ];

  const getStatusBadge = (status) => {
    const colors = {
      'Completed': 'success',
      'Pending': 'warning',
      'In Progress': 'primary',
      'Cancelled': 'danger'
    };
    return <Badge bg={colors[status] || 'secondary'}>{status}</Badge>;
  };

  const getTypeColor = (type) => {
    const colors = {
      'Preventive Maintenance': 'info',
      'Repair': 'warning',
      'Installation': 'primary',
      'Inspection': 'success'
    };
    return colors[type] || 'secondary';
  };

  return (
    <Row className="p-4">
      <Col>
        <div className="d-flex align-items-center mb-4">
          <History size={24} className="me-2" />
          <h3 className="mb-0">Job History</h3>
        </div>
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>Job ID</th>
              <th>Date</th>
              <th>Type</th>
              <th>Location</th>
              <th>Description</th>
              <th>Technician</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sampleHistory.map((job) => (
              <tr key={job.id}>
                <td>
                  <code>{job.id}</code>
                </td>
                <td>{new Date(job.date).toLocaleDateString()}</td>
                <td>
                  <Badge bg={getTypeColor(job.type)}>{job.type}</Badge>
                </td>
                <td>{job.location}</td>
                <td>{job.description}</td>
                <td>{job.technician}</td>
                <td>{job.duration}</td>
                <td>{getStatusBadge(job.status)}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Col>
    </Row>
  );
};

export default HistoryTab;