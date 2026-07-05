// import node module libraries
import { Fragment } from 'react';

// import sub components
import { CommonHeaderTabs, TeamGrid }  from 'sub-components';

const ProjectTeam = () => {
	return (
		<Fragment>
			{/* page header tabs */}
			<CommonHeaderTabs />

			{/* team grid */}
			<TeamGrid />
		</Fragment>
	);
};

export default ProjectTeam;
