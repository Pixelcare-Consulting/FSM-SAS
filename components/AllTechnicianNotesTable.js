import React, { useState } from 'react';
import { Table, Button, Form, InputGroup } from 'react-bootstrap';
import { Search } from 'react-bootstrap-icons';
import { formatDistanceToNow } from 'date-fns';

export const AllTechnicianNotesTable = ({ notes, onClose, jobId }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState({
    key: 'createdAt',
    direction: 'desc'
  });

  const filteredNotes = notes.filter(note =>
    note.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
    note.userEmail.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedNotes = [...filteredNotes].sort((a, b) => {
    if (sortConfig.key === 'createdAt') {
      return sortConfig.direction === 'asc' 
        ? a.createdAt - b.createdAt 
        : b.createdAt - a.createdAt;
    }
    if (a[sortConfig.key] < b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? -1 : 1;
    }
    if (a[sortConfig.key] > b[sortConfig.key]) {
      return sortConfig.direction === 'asc' ? 1 : -1;
    }
    return 0;
  });

  const requestSort = (key) => {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3>All Technician Notes</h3>
        <Button variant="secondary" onClick={onClose}>Back to Job Details</Button>
      </div>

      <InputGroup className="mb-3">
        <InputGroup.Text>
          <Search />
        </InputGroup.Text>
        <Form.Control
          type="text"
          placeholder="Search notes..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </InputGroup>

      <Table striped bordered hover>
        <thead>
          <tr>
            <th onClick={() => requestSort('content')} style={{ cursor: 'pointer' }}>
              Note {sortConfig.key === 'content' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => requestSort('userEmail')} style={{ cursor: 'pointer' }}>
              Created By {sortConfig.key === 'userEmail' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
            <th onClick={() => requestSort('createdAt')} style={{ cursor: 'pointer' }}>
              Date {sortConfig.key === 'createdAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
            </th>
          </tr>
        </thead>
        <tbody>
          {sortedNotes.map((note) => (
            <tr key={note.id}>
              <td>{note.content}</td>
              <td>{note.userEmail}</td>
              <td>
                {note.createdAt.toLocaleString()} 
                ({formatDistanceToNow(note.createdAt, { addSuffix: true })})
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};
