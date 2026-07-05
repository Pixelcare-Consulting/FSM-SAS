import React, { useState } from 'react';
import { Row, FormGroup, InputGroup, FormControl, Button, FormLabel, Col, Form } from 'react-bootstrap';

export const EditSkillsTab = ({ onSubmit }) => {
  const [skills, setSkills] = useState([]);

  const handleSkillChange = (index, event) => {
    const newSkills = [...skills];
    newSkills[index] = event.target.value;
    setSkills(newSkills);
  };

  const handleAddSkill = () => {
    setSkills([...skills, '']);
  };

  const handleRemoveSkill = (index) => {
    const newSkills = [...skills];
    newSkills.splice(index, 1);
    setSkills(newSkills);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (skills.length === 0) {
      console.error('Please add at least 1 skill for this worker.');
      return;
    }
    onSubmit(skills); 
  };

  return (
    <Row className="mb-3">
      <FormGroup as={Row} className="mb-3">
        <FormLabel column sm="3">Worker Skills</FormLabel>
        <Col sm="9">
          <Form onSubmit={handleSubmit}>
            {skills.map((skill, index) => (
              <FormGroup key={index} className="mb-3">
                <InputGroup>
                  <FormControl
                    type="text"
                    placeholder={`Add new Skill #${index + 1}`}
                    value={skill}
                    onChange={(event) => handleSkillChange(index, event)}
                  />
                  <Button
                    variant="outline-danger"
                    onClick={() => handleRemoveSkill(index)}
                    disabled={skills.length === 1}
                  >
                    Remove
                  </Button>
                </InputGroup>
              </FormGroup>
            ))}
            <Button variant="outline-primary" onClick={handleAddSkill}>
              Add Skill
            </Button>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button variant="primary" type="submit">
                Submit
              </Button>
            </div>
          </Form>
        </Col>
      </FormGroup>
    </Row>
  );
};


