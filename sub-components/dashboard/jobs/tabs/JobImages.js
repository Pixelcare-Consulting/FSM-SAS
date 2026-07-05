// import React, { useEffect, useState } from 'react';
// import { Row, Col, Form } from 'react-bootstrap';
// import { db } from '../../../../firebase';
// import { doc, getDoc } from 'firebase/firestore';
// import ModalImage from 'react-modal-image';

// const JobImages = ({ jobId, assignedWorkers }) => {
//   const [proofOfJobImages, setProofOfJobImages] = useState([]);
//   const [customerSignatures, setCustomerSignatures] = useState([]);
//   const [technicianSignatures, setTechnicianSignatures] = useState([]);
//   const [workerDocs, setWorkerDocs] = useState([]);

//   useEffect(() => {
//     const fetchWorkerDocs = async () => {
//       if (assignedWorkers.length === 0) return;

//       try {
//         const workerDocPromises = assignedWorkers.map(async (workerId) => {
//           const workerDocRef = doc(db, 'workerStatus', `${jobId}-${workerId}`);
//           const workerDocSnap = await getDoc(workerDocRef);
//           if (workerDocSnap.exists()) {
//             const workerData = workerDocSnap.data();
//             console.log('Worker Data:', workerData); // Debug log
//             return workerData;
//           } else {
//             console.error(`No such document: ${jobId}-${workerId}`);
//             return null;
//           }
//         });

//         const docs = (await Promise.all(workerDocPromises)).filter(doc => doc !== null);
//         setWorkerDocs(docs);

//         // Extract signatures and images
//         const customerSignatures = docs.flatMap(doc => doc.customerSignature ? [doc.customerSignature] : []);
//         const technicianSignatures = docs.flatMap(doc => doc.technicianSignature ? [doc.technicianSignature] : []);
//         const images = docs.flatMap(doc => doc.imageReports?.map(report => report.images).flat());

//         setCustomerSignatures(customerSignatures);
//         setTechnicianSignatures(technicianSignatures);
//         setProofOfJobImages(images);
//       } catch (error) {
//         console.error('Error fetching worker docs:', error);
//       }
//     };

//     fetchWorkerDocs();
//   }, [jobId, assignedWorkers]);

//   return (
//     <Form noValidate>
//       <h5 className="mb-1">Proof of Job Images</h5>
//       <p className="text-muted">Uploaded images related to the job.</p>
//       <Row className="mb-3">
//         {proofOfJobImages.length > 0 ? (
//           proofOfJobImages.map((url, index) => (
//             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
//               <ModalImage
//                 small={url}
//                 large={url}
//                 alt={`Proof of Job Image ${index + 1}`}
//               />
//             </Col>
//           ))
//         ) : (
//           <p>No images available.</p>
//         )}
//       </Row>

//       <h5 className="mb-1">Customer Signatures</h5>
//       <p className="text-muted">Uploaded customer signature images related to the job.</p>
//       <Row className="mb-3">
//         {customerSignatures.length > 0 ? (
//           customerSignatures.map((url, index) => (
//             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
//               <ModalImage
//                 small={url}
//                 large={url}
//                 alt={`Customer Signature Image ${index + 1}`}
//               />
//             </Col>
//           ))
//         ) : (
//           <p>No customer signatures available.</p>
//         )}
//       </Row>

//       <h5 className="mb-1">Technician Signatures</h5>
//       <p className="text-muted">Uploaded technician signature images related to the job.</p>
//       <Row className="mb-3">
//         {technicianSignatures.length > 0 ? (
//           technicianSignatures.map((url, index) => (
//             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
//               <ModalImage
//                 small={url}
//                 large={url}
//                 alt={`Technician Signature Image ${index + 1}`}
//               />
//             </Col>
//           ))
//         ) : (
//           <p>No technician signatures available.</p>
//         )}
//       </Row>
//     </Form>
//   );
// };

// export default JobImages;



// // import React, { useEffect, useState } from 'react';
// // import { Row, Col, Form, Image } from 'react-bootstrap';
// // import { db } from '../../../../firebase';
// // import { doc, getDoc } from 'firebase/firestore';
// // import ModalImage from 'react-modal-image';

// // const JobImages = ({ jobId, assignedWorkers }) => {
// //   const [proofOfJobImages, setProofOfJobImages] = useState([]);
// //   const [jobSignaturesImages, setJobSignaturesImages] = useState([]);
// //   const [workerDocs, setWorkerDocs] = useState([]);
// //   const [images, setImages] = useState([]);

// //   useEffect(() => {
// //     const fetchWorkerDocs = async () => {
// //       if (assignedWorkers.length === 0) return;

// //       try {
// //         const workerDocPromises = assignedWorkers.map(async (workerId) => {
// //           const workerDocRef = doc(db, 'workerStatus', `${jobId}-${workerId}`);
// //           const workerDocSnap = await getDoc(workerDocRef);
// //           if (workerDocSnap.exists()) {
// //             const workerData = workerDocSnap.data();
// //             console.log('Worker Data:', workerData); // Debug log
// //             return workerData;
// //           } else {
// //             console.error(`No such document: ${jobId}-${workerId}`);
// //             return null;
// //           }
// //         });

// //         const docs = (await Promise.all(workerDocPromises)).filter(doc => doc !== null);
// //         setWorkerDocs(docs);

// //         // Extract signatures and images
// //         const signatures = docs.flatMap(doc => [doc.customerSignature, doc.technicianSignature]);
// //         const images = docs.flatMap(doc => doc.imageReports?.map(report => report.images).flat());

// //         setJobSignaturesImages(signatures);
// //         setProofOfJobImages(images);
// //         setImages([...signatures, ...images]);
// //       } catch (error) {
// //         console.error('Error fetching worker docs:', error);
// //       }
// //     };

// //     fetchWorkerDocs();
// //   }, [jobId, assignedWorkers]);

// //   return (
// //     <Form noValidate>
// //       <h5 className="mb-1">Proof of Job Images</h5>
// //       <p className="text-muted">Uploaded images related to the job.</p>
// //       <Row className="mb-3">
// //         {proofOfJobImages.length > 0 ? (
// //           proofOfJobImages.map((url, index) => (
// //             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
// //               <ModalImage
// //                 small={url}
// //                 large={url}
// //                 alt={`Proof of Job Image ${index + 1}`}
// //               />
// //             </Col>
// //           ))
// //         ) : (
// //           <p>No images available.</p>
// //         )}
// //       </Row>

// //       <h5 className="mb-1">Job Signatures Images</h5>
// //       <p className="text-muted">Uploaded signature images related to the job.</p>
// //       <Row className="mb-3">
// //         {jobSignaturesImages.length > 0 ? (
// //           jobSignaturesImages.map((url, index) => (
// //             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
// //               <ModalImage
// //                 small={url}
// //                 large={url}
// //                 alt={`Job Signature Image ${index + 1}`}
// //               />
// //             </Col>
// //           ))
// //         ) : (
// //           <p>No signatures available.</p>
// //         )}
// //       </Row>

// //       <h5 className="mb-1">Worker Documents</h5>
// //       <p className="text-muted">Documents related to the worker status.</p>
// //       <Row className="mb-3">
// //         {workerDocs.length > 0 ? (
// //           workerDocs.map((doc, index) => (
// //             <Col key={index} xs={12} sm={6} md={4} lg={3} className="mb-2">
// //               {/* Display document details here */}
// //               <p>Job ID: {doc.jobId}</p> 
// //               <p>Worker Assigned: {doc.workerId}</p> 
// //               <p>Worker Status: {doc.workerStatus}</p> 
// //               <p>Job Status: {doc.status}</p> 
   
// //             </Col>
// //           ))
// //         ) : (
// //           <p>No documents available.</p>
// //         )}
// //       </Row>
// //     </Form>
// //   );
// // };

// // export default JobImages;
