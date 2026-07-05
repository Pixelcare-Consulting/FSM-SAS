import { v4 as uuid } from 'uuid';

export const RecentActivityData = [
	{
		id: uuid(),
		activity: 'Job Completed',
		activitybrief: `John completed the electrical inspection task.`,
		time: '5 mins ago',
		icon: 'check'
	},
	{
		id: uuid(),
		activity: 'New Work Order',
		activitybrief: `A new maintenance request was assigned to Sarah.`,
		time: '30 mins ago',
		icon: 'file-text'
	},
	{
		id: uuid(),
		activity: 'Job Overdue',
		activitybrief: `The job <a href="#"><u>status updated for Site A</u></a> is overdue.`,
		time: '1 day ago',
		icon: 'alert-triangle'
	},
	{
		id: uuid(),
		activity: 'Update Sent to Supervisor',
		time: '2 days ago',
		activitybrief: `David sent an update regarding the safety inspection for the client's warehouse.`,
		icon: 'mail'
	}
];

export default RecentActivityData;
