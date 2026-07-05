// import React, { useEffect, useState } from 'react';
// import { Row, Col } from 'react-bootstrap';
// import { mdiAccountGroup, mdiAccountCheck, mdiAccountRemove } from '@mdi/js'; // Update imports as needed

// // import Firebase
// import { db } from '../../../../../firebase'; 
// import { collection, getDocs } from 'firebase/firestore';

// // import widget/custom components
// import { StatRightBGIcon } from 'widgets'; // Ensure this path is correct

// const WorkerStats = () => {
//   const [users, setUsers] = useState([]);
//   const [stats, setStats] = useState({
//     totalUsers: 0,
//     active: 0,
//     inactive: 0,
//     fieldWorkers: 0,
//   });

//   // Fetch data from Firebase Firestore
//   useEffect(() => {
//     const fetchUsers = async () => {
//       try {
//         const usersCollection = collection(db, 'users');
//         const usersSnapshot = await getDocs(usersCollection);
//         const usersList = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//         setUsers(usersList);
//       } catch (error) {
//         console.error("Error fetching users:", error);
//       }
//     };

//     fetchUsers();
//   }, []);

//   // Calculate user statistics
//   useEffect(() => {
//     const calculateStats = () => {
//       const totalUsers = users.length;
//       const active = users.filter(user => user.activeUser).length;
//       const inactive = users.filter(user => !user.activeUser).length;
//       const fieldWorkers = users.filter(user => user.isFieldWorker).length;

//       setStats({
//         totalUsers,
//         active,
//         inactive,
//         fieldWorkers,
//       });
//     };

//     calculateStats();
//   }, [users]);

//   return (
//     <Row>
//       <Col xl={4} lg={4} md={12} sm={12}>
//         <StatRightBGIcon
//           title="Workers Statistics"
//           value={`${stats.totalUsers} Total`}
//           summary={`${stats.active} Active | ${stats.inactive} Inactive`}
//           iconName={mdiAccountGroup}
//           iconColorVariant="primary"
//           classValue="mb-4"
//         />
//       </Col>
//       <Col xl={4} lg={4} md={12} sm={12}>
//         <StatRightBGIcon
//           title="ACTIVE WORKERS"
//           value={stats.active}
//           summary="Active Workers Count"
//           iconName={mdiAccountCheck}
//           iconColorVariant="success"
//           classValue="mb-4"
//         />
//       </Col>
//       <Col xl={4} lg={4} md={12} sm={12}>
//         <StatRightBGIcon
//           title="FIELD WORKERS"
//           value={stats.fieldWorkers}
//           summary="Field Workers Count"
//           iconName={mdiAccountGroup}
//           iconColorVariant="info"
//           classValue="mb-4"
//         />
//       </Col>
//     </Row>
//   );
// };

// export default WorkerStats;
