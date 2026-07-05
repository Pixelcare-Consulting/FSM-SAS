// import React, { useEffect, useState } from 'react';
// import { Row, Form } from 'react-bootstrap';
// import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';
// import { collection, query, where, onSnapshot } from "firebase/firestore";
// import { db } from '../../../../firebase';  

// const mapContainerStyle = {
//   height: "450px",
//   width: "100%"
// };

// const JobLocation = ({ jobId }) => {
//   const [workersLocations, setWorkersLocations] = useState([]);

//   useEffect(() => {
//     if (!jobId) return; // Ensure jobId is provided

//     const q = query(collection(db, 'workerStatus'), where("jobId", "==", jobId));
//     const unsub = onSnapshot(q, (querySnapshot) => {
//       const locations = [];
//       querySnapshot.forEach((doc) => {
//         const data = doc.data();
//         if (data.origin) {
//           locations.push({
//             id: doc.id,
//             origin: {
//               lat: parseFloat(data.origin.latitude),
//               lng: parseFloat(data.origin.longitude),
//             },
//             destination: {
//               lat: parseFloat(data.destination.latitude),
//               lng: parseFloat(data.destination.longitude),
//             }
//           });
//         }
//       });
//       setWorkersLocations(locations);
//     });

//     return () => unsub();
//   }, [jobId]);

//   return (
//     <Form noValidate>
//       <p className="text-muted">Details about the Job Location.</p>
//       <Row className="mb-3">
//         <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
//           <GoogleMap
//             mapContainerStyle={mapContainerStyle}
//             center={workersLocations.length > 0 ? workersLocations[0].origin : { lat: 0, lng: 0 }} 
//             zoom={10} 
//           >
//             {workersLocations.map(worker => (
//               <React.Fragment key={worker.id}>
//                 <Marker position={worker.origin} label="Origin" />
//                 <Marker position={worker.destination} label="Destination" />
//               </React.Fragment>
//             ))}
//           </GoogleMap>
//         </LoadScript>
//       </Row>
//     </Form>
//   );
// };

// export default JobLocation;
