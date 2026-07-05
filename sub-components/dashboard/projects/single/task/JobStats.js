// import React, { useEffect, useState } from 'react';
// import { Row, Col } from 'react-bootstrap';
// import { mdiBriefcaseOutline, mdiBriefcaseCheckOutline, mdiAlertCircleOutline, mdiCalendar } from '@mdi/js'; 

// // import Firebase
// import { db } from '../../../../../firebase'; 
// import { collection, getDocs } from 'firebase/firestore';

// // import widget/custom components
// import { StatRightBGIcon } from 'widgets'; // Ensure this path is correct

// const JobStats = () => {
//   const [jobs, setJobs] = useState([]);
//   const [stats, setStats] = useState({
//     totalJobsThisMonth: 0,
//     totalJobsThisYear: 0,
//     completedJobs: 0,
//     overdueJobs: 0,
//   });

//   // Helper function to check if job start date is in the current month
//   const isCurrentMonth = (jobDate) => {
//     const today = new Date();
//     const jobCreationDate = new Date(jobDate);
//     return jobCreationDate.getMonth() === today.getMonth() && jobCreationDate.getFullYear() === today.getFullYear();
//   };

//   // Helper function to check if job start date is in the current year
//   const isCurrentYear = (jobDate) => {
//     const today = new Date();
//     const jobCreationDate = new Date(jobDate);
//     return jobCreationDate.getFullYear() === today.getFullYear();
//   };

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

//   // Calculate job statistics
//   useEffect(() => {
//     const calculateStats = () => {
//       const totalJobsThisMonth = jobs.filter(job => isCurrentMonth(job.startDate)).length;
//       const totalJobsThisYear = jobs.filter(job => isCurrentYear(job.startDate)).length;
//       const completedJobs = jobs.filter(job => job.jobStatus === 'Job Complete').length;
//       const overdueJobs = jobs.filter(job => {
//         if (!job.endDate) return false;
        
//         const today = new Date();
//         today.setHours(0, 0, 0, 0); // Reset time to 00:00:00 to compare only the date
        
//         const jobEndDate = new Date(job.endDate);
//         jobEndDate.setHours(0, 0, 0, 0); // Reset time to 00:00:00 to compare only the date
        
//         return jobEndDate < today && job.jobStatus !== 'Job Complete';
//       }).length;

//       setStats({
//         totalJobsThisMonth,
//         totalJobsThisYear,
//         completedJobs,
//         overdueJobs,
//       });
//     };

//     calculateStats();
//   }, [jobs]);

//   return (
//     <Row>
//       <Col xl={3} lg={3} md={6} sm={12}>
//         <StatRightBGIcon
//           title="Total Jobs This Month"
//           value={`${stats.totalJobsThisMonth} Jobs`}
//           summary="Jobs Created This Month"
//           iconName={mdiBriefcaseOutline}
//           iconColorVariant="primary"
//           classValue="mb-4"
//         />
//       </Col>
//       <Col xl={3} lg={3} md={6} sm={12}>
//         <StatRightBGIcon
//           title="Total Jobs (All Year)"
//           value={`${stats.totalJobsThisYear} Jobs`}
//           summary="Total Jobs Created This Year"
//           iconName={mdiCalendar}
//           iconColorVariant="info"
//           classValue="mb-4"
//         />
//       </Col>
//       <Col xl={3} lg={3} md={6} sm={12}>
//         <StatRightBGIcon
//           title="Completed Jobs"
//           value={stats.completedJobs}
//           summary="Completed Jobs Count"
//           iconName={mdiBriefcaseCheckOutline}
//           iconColorVariant="success"
//           classValue="mb-4"
//         />
//       </Col>
//       <Col xl={3} lg={3} md={6} sm={12}>
//         <StatRightBGIcon
//           title="Overdue Jobs"
//           value={stats.overdueJobs}
//           summary="Overdue Jobs Count"
//           iconName={mdiAlertCircleOutline}
//           iconColorVariant="danger"
//           classValue="mb-4"
//         />
//       </Col>
//     </Row>
//   );
// };

// export default JobStats;


// // import React, { useEffect, useState } from 'react';
// // import { Row, Col } from 'react-bootstrap';
// // import { mdiBriefcaseOutline, mdiBriefcaseCheckOutline, mdiAlertCircleOutline, mdiCalendar } from '@mdi/js'; 

// // // import Firebase
// // import { db } from '../../../../../firebase'; 
// // import { collection, getDocs } from 'firebase/firestore';

// // // import widget/custom components
// // import { StatRightBGIcon } from 'widgets'; // Ensure this path is correct

// // const JobStats = () => {
// //   const [jobs, setJobs] = useState([]);
// //   const [stats, setStats] = useState({
// //     totalJobsThisMonth: 0,
// //     totalJobsThisYear: 0,
// //     completedJobs: 0,
// //     overdueJobs: 0,
// //   });
  

// //   // Helper function to check if job start date is in the current month
// //   const isCurrentMonth = (jobDate) => {
// //     const today = new Date();
// //     const jobCreationDate = new Date(jobDate);
// //     return jobCreationDate.getMonth() === today.getMonth() && jobCreationDate.getFullYear() === today.getFullYear();
// //   };

// //   // Helper function to check if job start date is in the current year
// //   const isCurrentYear = (jobDate) => {
// //     const today = new Date();
// //     const jobCreationDate = new Date(jobDate);
// //     return jobCreationDate.getFullYear() === today.getFullYear();
// //   };

// //   // Fetch data from Firebase Firestore
// //   useEffect(() => {
// //     const fetchJobs = async () => {
// //       try {
// //         const jobsCollection = collection(db, 'jobs');
// //         const jobsSnapshot = await getDocs(jobsCollection);
// //         const jobsList = jobsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
// //         setJobs(jobsList);
// //       } catch (error) {
// //         console.error("Error fetching jobs:", error);
// //       }
// //     };

// //     fetchJobs();
// //   }, []);

// //   // Calculate job statistics
// //   useEffect(() => {
// //     const calculateStats = () => {
// //       const totalJobsThisMonth = jobs.filter(job => isCurrentMonth(job.startDate)).length;
// //       const totalJobsThisYear = jobs.filter(job => isCurrentYear(job.startDate)).length;
// //       const completedJobs = jobs.filter(job => job.jobStatus === 'Job Complete').length;
// //       const overdueJobs = jobs.filter(job => new Date(job.endDate) < new Date() && job.jobStatus !== 'Job Complete').length;

// //       setStats({
// //         totalJobsThisMonth,
// //         totalJobsThisYear,
// //         completedJobs,
// //         overdueJobs,
// //       });
// //     };

// //     calculateStats();
// //   }, [jobs]);

// //   return (
// //     <Row>
// //       <Col xl={3} lg={3} md={6} sm={12}>
// //         <StatRightBGIcon
// //           title="Total Jobs This Month"
// //           value={`${stats.totalJobsThisMonth} Jobs`}
// //           summary="Jobs Created This Month"
// //           iconName={mdiBriefcaseOutline}
// //           iconColorVariant="primary"
// //           classValue="mb-4"
// //         />
// //       </Col>
// //       <Col xl={3} lg={3} md={6} sm={12}>
// //         <StatRightBGIcon
// //           title="Total Jobs (All Year)"
// //           value={`${stats.totalJobsThisYear} Jobs`}
// //           summary="Total Jobs Created This Year"
// //           iconName={mdiCalendar}
// //           iconColorVariant="info"
// //           classValue="mb-4"
// //         />
// //       </Col>
// //       <Col xl={3} lg={3} md={6} sm={12}>
// //         <StatRightBGIcon
// //           title="Completed Jobs"
// //           value={stats.completedJobs}
// //           summary="Completed Jobs Count"
// //           iconName={mdiBriefcaseCheckOutline}
// //           iconColorVariant="success"
// //           classValue="mb-4"
// //         />
// //       </Col>
// //       <Col xl={3} lg={3} md={6} sm={12}>
// //         <StatRightBGIcon
// //           title="Overdue Jobs"
// //           value={stats.overdueJobs}
// //           summary="Overdue Jobs Count"
// //           iconName={mdiAlertCircleOutline}
// //           iconColorVariant="danger"
// //           classValue="mb-4"
// //         />
// //       </Col>
// //     </Row>
// //   );
// // };

// // export default JobStats;
