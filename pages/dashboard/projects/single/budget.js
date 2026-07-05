// import node module libraries
import { Fragment } from 'react';
import { Row, Col } from 'react-bootstrap';

// import sub components
import { CommonHeaderTabs, BudgetCard, ExpensesChartCard, BudgetCategoryCard, BudgetDetailsCard }  from 'sub-components';

const ProjectBudget = () => {
	return (
		<Fragment>
			{/* page header tabs */}
			<CommonHeaderTabs />

			{/* total budget, spend and remaining  */}
			<BudgetCard />

			{/* expenses chart and budget categories table cards */}
			<Row>
				<Col lg={6} className="mb-4">
					<ExpensesChartCard />
				</Col>
				<Col lg={6} className="mb-4">
					<BudgetCategoryCard />
				</Col>
			</Row>

			{/* budget details table card */}
			<BudgetDetailsCard />
		</Fragment>
	);
};

export default ProjectBudget;
