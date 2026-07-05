// import React, { useEffect, useState } from "react";
// import Link from "next/link";
// import { Card } from "react-bootstrap";
// import { ApexCharts } from "widgets";

// // Import Firebase
// import { db } from "../../../../../firebase";
// import { collection, getDocs } from "firebase/firestore";

// // Import your existing chart configuration
// import { TaskSummaryChartOptions as baseChartOptions } from "data/charts/ChartData";

// const TaskSummaryChart = () => {
//   const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
//   const [availableYears, setAvailableYears] = useState([]);
//   const [chartData, setChartData] = useState([
//     {
//       name: "Closed",
//       data: [],
//     },
//     {
//       name: "New",
//       data: [],
//     },
//   ]);
//   const [chartOptions, setChartOptions] = useState({
//     ...baseChartOptions,
//     chart: {
//       ...baseChartOptions.chart,
//       type: 'bar',
//       stacked: false,
//     },
//     plotOptions: {
//       bar: {
//         horizontal: false,
//         columnWidth: '55%',
//         endingShape: 'rounded'
//       },
//     },
//     dataLabels: {
//       enabled: false
//     },
//     stroke: {
//       show: true,
//       width: 2,
//       colors: ['transparent']
//     },
//     xaxis: {
//       categories: Array.from({ length: 12 }, (_, i) => {
//         return new Date(0, i).toLocaleString('default', { month: 'short' });
//       }),
//     },
//     yaxis: {
//       title: {
//         text: 'Number of Jobs'
//       }
//     },
//     fill: {
//       opacity: 1
//     },
//     tooltip: {
//       y: {
//         formatter: function (val) {
//           return val + " jobs"
//         }
//       }
//     }
//   });

//   useEffect(() => {
//     const fetchJobsData = async () => {
//       try {
//         const querySnapshot = await getDocs(collection(db, "jobs"));
//         let closedJobsCount = Array(12).fill(0);
//         let newJobsCount = Array(12).fill(0);
        
//         // Get all available years from the data
//         const years = new Set();
        
//         querySnapshot.forEach((doc) => {
//           const job = doc.data();
//           const startDate = new Date(job.startDate);
//           const jobYear = startDate.getFullYear();
//           years.add(jobYear);
          
//           // Only process jobs from selected year
//           if (jobYear === selectedYear) {
//             const month = startDate.getMonth();
//             if (job.jobStatus === "Job Complete") {
//               closedJobsCount[month]++;
//             } else {
//               newJobsCount[month]++;
//             }
//           }
//         });

//         // Sort years in descending order
//         setAvailableYears(Array.from(years).sort((a, b) => b - a));
        
//         setChartData([
//           {
//             name: "Closed",
//             data: closedJobsCount,
//           },
//           {
//             name: "New",
//             data: newJobsCount,
//           },
//         ]);
//       } catch (error) {
//         console.error("Error fetching jobs data:", error);
//         setChartData([
//           {
//             name: "Closed",
//             data: Array(12).fill(0),
//           },
//           {
//             name: "New",
//             data: Array(12).fill(0),
//           },
//         ]);
//       }
//     };

//     fetchJobsData();
//   }, [selectedYear]); // Re-fetch when selected year changes

//   return (
//     <Card>
//       <Card.Body>
//         <div className="d-flex justify-content-between align-items-center">
//           <div>
//             <h4 className="mb-0">Jobs Summary</h4>
//           </div>
//           <div>
//             <select 
//               className="form-select" 
//               value={selectedYear}
//               onChange={(e) => setSelectedYear(Number(e.target.value))}
//             >
//               {availableYears.map((year) => (
//                 <option key={year} value={year}>
//                   {year}
//                 </option>
//               ))}
//             </select>
//           </div>
//         </div>
//         <p className="mt-4 mb-0">New vs. Closed</p>
//         {chartData[0].data.length > 0 && chartData[1].data.length > 0 ? (
//           <ApexCharts
//             options={chartOptions}
//             series={chartData}
//             type="bar"
//             height={350}
//           />
//         ) : (
//           <p>Loading chart data...</p>
//         )}
//       </Card.Body>
//     </Card>
//   );
// };

// export default TaskSummaryChart;
