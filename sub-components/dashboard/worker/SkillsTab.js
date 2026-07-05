import React, { useState, useEffect } from "react";
import {
  Row,
  FormGroup,
  InputGroup,
  FormControl,
  Button,
  FormLabel,
  Col,
  Form,
} from "react-bootstrap";
import { toast } from "react-toastify";

export const SkillsTab = ({ onSubmit, initialValues }) => {
  const [skills, setSkills] = useState([""]); // Initialize with one empty skill

  // Use useEffect to set initial values when the component mounts
  useEffect(() => {
    if (initialValues && initialValues.length > 0) {
      setSkills(initialValues);
    }
  }, [initialValues]);

  const handleSkillChange = (index, event) => {
    const newSkills = [...skills];
    newSkills[index] = event.target.value;
    setSkills(newSkills);
  };

  const handleAddSkill = () => {
    setSkills([...skills, ""]);
  };

  const handleRemoveSkill = (index) => {
    const newSkills = [...skills];
    newSkills.splice(index, 1);
    setSkills(newSkills);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Filter out any empty skill entries
    const filteredSkills = skills.filter((skill) => skill.trim() !== "");

    // // Validation: Ensure at least one skill is provided
    // if (filteredSkills.length === 0) {
    //   toast.error("Please add at least 1 skill for this worker.");
    //   return;
    // }

    onSubmit(filteredSkills); // Pass the valid skills to the parent
  };

  return (
    <Form onSubmit={handleSubmit}>
      <Row className="mb-3">
        <FormGroup as={Row}>
          <FormLabel column sm="3">
            Worker Skills
          </FormLabel>
          <Col sm="9">
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
          </Col>
        </FormGroup>
      </Row>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="primary" type="submit">
          Submit
        </Button>
      </div>
    </Form>
  );
};

// import React, { useState } from 'react';
// import { Row, FormGroup, InputGroup, FormControl, Button, FormLabel, Col, Form } from 'react-bootstrap';
// import { toast, ToastContainer } from 'react-toastify';

// export const SkillsTab = ({ onSubmit }) => {
//   const [skills, setSkills] = useState([]);

//   const handleSkillChange = (index, event) => {
//     const newSkills = [...skills];
//     newSkills[index] = event.target.value;
//     setSkills(newSkills);
//   };

//   const handleAddSkill = () => {
//     setSkills([...skills, '']);
//   };

//   const handleRemoveSkill = (index) => {
//     const newSkills = [...skills];
//     newSkills.splice(index, 1);
//     setSkills(newSkills);
//   };

//   const handleSubmit = (e) => {
//     e.preventDefault();
//     if (skills.length === 0) {
//       //console.error('Please add at least 1 skill for this worker.');

//       // Show error toast
//       toast.error('Please add at least 1 skill for this worker.');

//       return;
//     }
//     onSubmit(skills);
//   };

//   return (
//     <Row className="mb-3">
//       <FormGroup as={Row} className="mb-3">
//         <FormLabel column sm="3">Worker Skills</FormLabel>
//         <Col sm="9">
//           <Form onSubmit={handleSubmit}>
//             {skills.map((skill, index) => (
//               <FormGroup key={index} className="mb-3">
//                 <InputGroup>
//                   <FormControl
//                     type="text"
//                     placeholder={`Add new Skill #${index + 1}`}
//                     value={skill}
//                     onChange={(event) => handleSkillChange(index, event)}
//                   />
//                   <Button
//                     variant="outline-danger"
//                     onClick={() => handleRemoveSkill(index)}
//                     disabled={skills.length === 1}
//                   >
//                     Remove
//                   </Button>
//                 </InputGroup>
//               </FormGroup>
//             ))}
//             <Button variant="outline-primary" onClick={handleAddSkill}>
//               Add Skill
//             </Button>
//             <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
//               <Button variant="primary" type="submit">
//                 Submit
//               </Button>
//             </div>
//           </Form>
//         </Col>
//       </FormGroup>
//     </Row>
//   );
// };

// // import React, { useState } from 'react';
// // import { Row, FormGroup, InputGroup, FormControl, Button, FormLabel, Col, Form } from 'react-bootstrap';

// // export const SkillsTab = ({ onSubmit }) => {
// //   const [skills, setSkills] = useState([{ value: '' }]);

// //   const handleSkillChange = (index, event) => {
// //     const newSkills = [...skills];
// //     newSkills[index].value = event.target.value;
// //     setSkills(newSkills);
// //   };

// //   const handleAddSkill = () => {
// //     setSkills([...skills, { Skill: '' }]);
// //   };

// //   const handleRemoveSkill = (index) => {
// //     if (skills.length === 1) return;
// //     const newSkills = [...skills];
// //     newSkills.splice(index, 1);
// //     setSkills(newSkills);
// //   };

// //   const handleSubmit = (e) => {
// //     e.preventDefault();
// //     if (!skills) {
// //       console.error('Please add atleast 1 skills for this worker.');
// //       return; // Stop execution if skills data is empty
// //     }
// //     // Submit skills data to parent component
// //     console.log(skills);
// //     onSubmit(skills);
// //   };

// //   return (
// //     <Row className="mb-3">
// //       <FormGroup as={Row} className="mb-3">
// //         <FormLabel column sm="3">Worker Skills</FormLabel>
// //         <Col sm="9">
// //           <Form onSubmit={handleSubmit}>
// //             {skills.map((skill, index) => (
// //               <FormGroup key={index} className="mb-3">
// //                 <InputGroup>
// //                   <FormControl
// //                     type="text"
// //                     placeholder={`Add new Skill #${index + 1}`}
// //                     value={skill.value}
// //                     onChange={(event) => handleSkillChange(index, event)}
// //                   />
// //                   <Button
// //                     variant="outline-danger"
// //                     onClick={() => handleRemoveSkill(index)}
// //                     disabled={skills.length === 1} // Prevent removing the last skill input
// //                   >
// //                     Remove
// //                   </Button>
// //                 </InputGroup>
// //               </FormGroup>
// //             ))}
// //             <Button variant="outline-primary" onClick={handleAddSkill}>
// //               Add Skill
// //             </Button>
// //             <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
// //               <Button variant="primary" type="submit">
// //                 Submit
// //               </Button>
// //             </div>
// //           </Form>
// //         </Col>
// //       </FormGroup>
// //     </Row>
// //   );
// // };

// // import React, { useState } from 'react';
// // import {
// //   Container,
// //   Row,
// //   Col,
// //   Card,
// //   Form,
// //   FormGroup,
// //   FormLabel,
// //   FormControl,
// //   Button,
// //   InputGroup,
// //   Alert,
// //   Image,
// // } from 'react-bootstrap';

// // export const SkillsTab = () => {
// //   const [skills, setSkills] = useState([{ value: '' }]);

// //   const handleSkillChange = (index, event) => {
// //     const newSkills = skills.slice();
// //     newSkills[index].value = event.target.value;
// //     setSkills(newSkills);
// //   };

// //   const handleAddSkill = () => {
// //     setSkills([...skills, { value: '' }]);
// //   };

// //   const handleRemoveSkill = (index) => {
// //     const newSkills = skills.slice();
// //     newSkills.splice(index, 1);
// //     setSkills(newSkills);
// //   };

// //   return (
// //     <Row className="mb-3">
// //         <Form.Label>Worker Skills</Form.Label>

// //     <Form>
// //       {skills.map((skill, index) => (
// //         <FormGroup key={index} className="mb-3">
// //           <InputGroup>
// //             <FormControl
// //               type="text"
// //               placeholder={`Add new Skills #${index + 1}`}
// //               value={skill.value}
// //               onChange={(event) => handleSkillChange(index, event)}
// //             />
// //             <Button
// //               variant="outline-danger"
// //               onClick={() => handleRemoveSkill(index)}
// //               disabled={skills.length === 1} // Prevent removing the last skill input
// //             >
// //               Remove
// //             </Button>
// //           </InputGroup>
// //         </FormGroup>
// //       ))}
// //       <Button variant="outline-primary" onClick={handleAddSkill}>
// //         Add Skill
// //       </Button>
// //       <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
// //       <Button variant="primary" type="submit">Submit</Button>
// //     </div>

// //     </Form>
// //     </Row>
// //   );
// // };
