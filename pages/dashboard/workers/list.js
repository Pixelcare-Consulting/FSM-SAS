// import node module libraries
import { Fragment } from 'react';
import { Col, Row, Card, Tab, Breadcrumb, Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { FaPlus } from 'react-icons/fa';
import Link from 'next/link';

// import widget/custom components
import { GeeksSEO, GridListViewButton } from 'widgets';

// import sub components
import { WorkerGridCard,  WorkersListItems }  from 'sub-components';


const Worker = () => {
	return (
		<Fragment>
			<GeeksSEO title="Technician Lists | SAS&ME - SAP B1 | Portal" />
			<Tab.Container defaultActiveKey="list">

				<Tab.Content>
					<Tab.Pane eventKey="list" className="pb-4 tab-pane-custom-margin">
						<WorkersListItems />
					</Tab.Pane>
				</Tab.Content>
			</Tab.Container>
			<style jsx global>{`
				.header-button {
					font-weight: 500 !important;
					backdrop-filter: blur(8px);
				}

				.header-button:hover {
					color: white !important;
				}

				.header-button:active {
					transform: translateY(0) !important;
				}
			`}</style>
		</Fragment>
	);
};

export default Worker;
