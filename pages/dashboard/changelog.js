// import node module libraries
import { Fragment } from 'react';
import { Col, Row, Alert } from 'react-bootstrap';
import { ExclamationTriangleFill } from 'react-bootstrap-icons';

// import sub components
import Version_01_00_00 from 'sub-components/dashboard/changelog/Version_01_00_00';
import Version_01_00_01 from 'sub-components/dashboard/changelog/Version_01_00_01';
import Version_02_00_00 from 'sub-components/dashboard/changelog/Version_02_00_00';
import Version_02_00_01 from 'sub-components/dashboard/changelog/Version_02_00_01';
import Version_02_01_00 from 'sub-components/dashboard/changelog/Version_02_01_00';
import Version_02_01_01 from 'sub-components/dashboard/changelog/Version_02_01_01';
import Version_02_02_00 from 'sub-components/dashboard/changelog/Version_02_02_00';
import Version_02_02_01 from 'sub-components/dashboard/changelog/Version_02_02_01';

const ChangeLog = () => {
	return (
		<Fragment>
			<Row>
				<Col lg={12} md={12} sm={12}>
					<div className="border-bottom pb-4 mb-4 d-md-flex justify-content-between align-items-center">
						<div className="mb-3 mb-md-0">
							<h1 className="mb-0 h2 fw-bold">Changelog</h1>
							<p className="mb-0">
								We’re constantly improving & updating Geeks. See the latest
								features and improvements.
							</p>
						</div>
					</div>
				</Col>
			</Row>

			<Row>
				<Col lg={7} md={12} sm={12}>
					<Alert variant="warning" className="justify-content-between d-flex">
						<div>
							<ExclamationTriangleFill size={20} className="me-1" />
						</div>
						<div className="ms-3">
							<Alert.Heading as="h4">
								Make a backup before updating.
							</Alert.Heading>
							Before updating, read the changelog carefully and please backup
							your project and customizations, because having a backup will keep
							you safe from losing anything.
						</div>
					</Alert>
				</Col>
			</Row>

			<Version_02_02_01 />
			<hr className="my-5" />

			<Version_02_02_00 />
			<hr className="my-5" />

			<Version_02_01_01 />
			<hr className="my-5" />

			<Version_02_01_00 />
			<hr className="my-5" />

			<Version_02_00_01 />
			<hr className="my-5" />

			<Version_02_00_00 />
			<hr className="my-5" />

			<Version_01_00_01 />
			<hr className="my-5" />

			<Version_01_00_00 />
		</Fragment>
	);
};

export default ChangeLog;
