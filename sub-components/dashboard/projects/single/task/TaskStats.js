// // import node module libraries
// import React, { useEffect, useState } from 'react';
// import { Row, Col } from 'react-bootstrap';

// // import Firebase
// import { db } from '../../../../../firebase'; 
// import { collection, getDocs } from 'firebase/firestore';

// // import widget/custom components
// import { StatCenterInfo } from 'widgets';

// // Helper function to determine if a job is overdue
// // const isOverdue = (endDate, status) => {
// //   if (!endDate) return false;
// //   const today = new Date();
// //   const jobEndDate = new Date(endDate);
// //   return jobEndDate < today && status !== 'JC'; // Assuming 'JC' stands for 'Job Complete'
// // };

// const isOverdue = (endDate, status) => {
//   if (!endDate) return false;
  
//   const today = new Date();
//   today.setHours(0, 0, 0, 0); // Reset time to 00:00:00 to compare only the date

//   const jobEndDate = new Date(endDate);
//   jobEndDate.setHours(0, 0, 0, 0); // Reset time to 00:00:00 to compare only the date

//   return jobEndDate < today && status !== 'JC'; // Compare only the date
// };


// const TaskStats = () => {
//   const [jobs, setJobs] = useState([]);
//   const [stats, setStats] = useState({
//     totalJobs: 0,
//     inProgress: 0,
//     completed: 0,
//     overdue: 0,
//   });

//   // Fetch data from Firebase Firestore
//   useEffect(() => {
//     const fetchJobs = async () => {
//       try {
//         const jobsCollection = collection(db, 'jobs');
//         const jobsSnapshot = await getDocs(jobsCollection);
//         const jobsList = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
//         setJobs(jobsList);
//       } catch (error) {
//         console.error("Error fetching jobs:", error);
//       }
//     };

//     fetchJobs();
//   }, []);

//   // Calculate statistics based on fetched jobs
//   useEffect(() => {
//     const calculateStats = () => {
//       const totalJobs = jobs.length;
//       const inProgress = jobs.filter(job => job.jobStatus === 'JS').length; // 'JS' stands for 'Job Started'
//       const completed = jobs.filter(job => job.jobStatus === 'JC').length; // 'JC' stands for 'Job Complete'
//       const overdue = jobs.filter(job => isOverdue(job.endDate, job.jobStatus)).length;

//       setStats({
//         totalJobs,
//         inProgress,
//         completed,
//         overdue,
//       });
//     };

//     calculateStats();
//   }, [jobs]);

//   return (
//     <Row>
//       <Col md={6} xl={3} xs={12}>
//         {/* Total Jobs Summary Stat Card */}
//         <StatCenterInfo
//           title="Jobs Summary"
//           value={stats.totalJobs}
//           valueColorVariant="primary"
//           contentHTML="Total Jobs Count"
//         />
//       </Col>
//       <Col md={6} xl={3} xs={12}>
//         {/* In Progress Stat Card */}
//         <StatCenterInfo
//           title="In Progress"
//           value={stats.inProgress}
//           valueColorVariant="info"
//           contentHTML={`${stats.inProgress} In Progress`}
//         />
//       </Col>
//       <Col md={6} xl={3} xs={12}>
//         {/* Completed Stat Card */}
//         <StatCenterInfo
//           title="Completed"
//           value={stats.completed}
//           valueColorVariant="success"
//           contentHTML={`${stats.completed} Jobs Completed`}
//         />
//       </Col>
//       <Col md={6} xl={3} xs={12}>
//         {/* Overdue Stat Card */}
//         <StatCenterInfo
//           title="Overdue"
//           value={stats.overdue}
//           valueColorVariant="danger"
//           contentHTML={`${stats.overdue} Overdue`}
//         />
//       </Col>
//     </Row>
//   );
// };

// export default TaskStats;


// // // import node module libraries
// // import { Row, Col } from 'react-bootstrap';

// // // import widget/custom components
// // import { StatCenterInfo }  from 'widgets';

// // const TaskStats = () => {
// // 	return (
// // 		<Row>
// // 			<Col md={6} xl={3} xs={12}>
// // 				{/* task summary stat card  */}
// // 				<StatCenterInfo
// // 					title="Jobs Summary"
// // 					value={50}
// // 					valueColorVariant="primary"
// // 					contentHTML="Total Jobs Count"
// // 				/>
// // 			</Col>
// // 			<Col md={6} xl={3} xs={12}>
// // 				{/* in progress stat card  */}
// // 				<StatCenterInfo
// // 					title="In Progress"
// // 					value={12}
// // 					valueColorVariant="info"
// // 					contentHTML='<span class="text-dark fw-semi-bold">6</span> In Progress'
// // 				/>
// // 			</Col>
// // 			<Col md={6} xl={3} xs={12}>
// // 				{/* completed stat card  */}
// // 				<StatCenterInfo
// // 					title="Completed"
// // 					value={30}
// // 					valueColorVariant="success"
// // 					contentHTML='<span class="text-dark fw-semi-bold">8</span> Today Completed'
// // 				/>
// // 			</Col>
// // 			<Col md={6} xl={3} xs={12}>
// // 				{/* overdue stat card  */}
// // 				<StatCenterInfo
// // 					title="Overdue"
// // 					value={8}
// // 					valueColorVariant="danger"
// // 					contentHTML='<span class="text-dark fw-semi-bold">4</span> Yesterday'
// // 				/>
// // 			</Col>
// // 		</Row>
// // 	);
// // };
// // export default TaskStats;
