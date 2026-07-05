import { v4 as uuid } from 'uuid';

export const UpcomingTaskListData = [
	{
		id: uuid(),
		task: 'HVAC System Inspection',
		assignee: '/images/avatar/avatar-1.jpg',
		progress: 65,
		enddate: 'Set end date',
		status: 'In Progress',
		statuscolor: 'info'
	},
	{
		id: uuid(),
		task: 'Plumbing Repair',
		assignee: '/images/avatar/avatar-2.jpg',
		progress: 75,
		enddate: 'Oct 10, 2024',
		status: 'In Progress',
		statuscolor: 'info'
	},
	{
		id: uuid(),
		task: 'Electrical System Maintenance',
		assignee: '/images/avatar/avatar-3.jpg',
		progress: 86,
		enddate: 'Oct 12, 2024',
		status: 'Completed',
		statuscolor: 'success'
	},
	{
		id: uuid(),
		task: 'Fire Safety Equipment Check',
		assignee: '/images/avatar/avatar-4.jpg',
		progress: 40,
		enddate: 'Oct 15, 2024',
		status: 'Scheduled',
		statuscolor: 'warning'
	},
	{
		id: uuid(),
		task: 'Security System Upgrade',
		assignee: '/images/avatar/avatar-6.jpg',
		progress: 35,
		enddate: 'Oct 16, 2024',
		status: 'In Progress',
		statuscolor: 'info'
	}
];

export default UpcomingTaskListData;
