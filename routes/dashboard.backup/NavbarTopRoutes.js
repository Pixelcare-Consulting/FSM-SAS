import { v4 as uuid } from 'uuid';

const NavbarDefault = [
	{
		id: uuid(),
		menuitem: 'Dashboard',
		link: '/dashboard',
		children: [
			{ id: uuid(), menuitem: 'Overview', link: '/' },
		]
	},
	{
		id: uuid(),
		menuitem: 'Management',
		link: '#',
		children: [
			{
				id: uuid(),
				menuitem: 'Customers',
				link: '/dashboard/customers'
			},
			{
				id: uuid(),
				menuitem: 'Workers',
				link: '#',
				children: [
					{
						id: uuid(),
						menuitem: 'All Workers',
						link: '/dashboard/workers'
					},
					{
						id: uuid(),
						menuitem: 'Create Worker',
						link: '/dashboard/workers/create-worker'
					}
				]
			},
			{
				id: uuid(),
				menuitem: 'Jobs',
				link: '#',
				children: [
					{
						id: uuid(),
						menuitem: 'All Jobs',
						link: '/dashboard/jobs'
					},
					{
						id: uuid(),
						menuitem: 'Create Job',
						link: '/dashboard/jobs/create-jobs'
					},
					{
						id: uuid(),
						menuitem: 'Calendar',
						link: '/dashboard/jobs/calendar'
					},
					{
						id: uuid(),
						menuitem: 'Schedule',
						link: '/dashboard/jobs/schedule'
					}
				]
			}
		]
	}
	// ... existing authentication and other routes can remain ...
];

export default NavbarDefault;
