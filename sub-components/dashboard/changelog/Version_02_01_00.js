// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_02_01_00 = () => {
	const NewSass = [
		'/styles/theme/vendor/fullcalendar/_calendar.scss',
	]
	const UpdatedSass = [
		'/styles/theme/_theme.scss',
		'/styles/themes/vendor/_flatpickr.scss',
	]
	const NewReactFiles = [
		'/pages/dashboard/calendar.js',
		'/pages/dashboard/mail/*.*',
		'/store/mailSlice.js',
		'/sub-components/dashboard/calendar/*.*',
		'/sub-components/dashboard/mail-app/*.*'
	]
	const UpdatedReactFiles = [
		'/store/store.js',
		'/widgets/form-select/FormSelect.js',
		'/widgets/highlight-code/HighlightCode.js',
		'/routes/DashboardRoutes.js',
		'/routes/marketing/NavbarDefault.js',
		'/sub-components/index.js'
	]
	const NewDataFiles = [
		'/data/dashboard/calendar/*.*',
		'/data/dashboard/mail/*.*'
	]
	return (
		<Row>
			<Col lg={7} md={12} sm={12}>
				<Card>
					<Card.Body>
						<Row className="g-0">
							<Col lg={3} md={4} sm={12}>
								<div id="initial">
									<h5 className="mb-3 fwsemi--bold">
										<code>v2.1.0</code> - May 30, 2023
									</h5>
								</div>
							</Col>
							<Col lg={9} md={8} sm={12}>
								<div>
									<h4 className="mb-1 fw-semi-bold">Geeks NextJS Update</h4>
									<ul>
										<li>Required packages are Updated</li>
										<li>Added <code>@fullcalendar/bootstrap5</code> , <code>@fullcalendar/core</code> , <code>@fullcalendar/daygrid</code> ,
											<code>@fullcalendar/interaction</code> , <code>@fullcalendar/list</code> , <code>@fullcalendar/react</code> and <code>@fullcalendar/timegrid</code> new packages</li>
										<li>Fixed a few bugs</li>
									</ul>

								</div>
								<div className="mb-3">
									<h4>New Components / Layout / Hook / React Files:</h4>
									<ul>
										{NewReactFiles.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>

								<div className="mb-3">
									<h4>New SCSS Files:</h4>
									<ul>
										{NewSass.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
								<div className="mb-3">
									<h4>Updated React Files:</h4>
									<ul>
										{UpdatedReactFiles.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>

								<div className="mb-3">
									<h4>Updated SCSS Files:</h4>
									<ul>
										{UpdatedSass.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
								<div className="mb-3">
									<h4>Added Data Files:</h4>
									<ul>
										{NewDataFiles.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
							</Col>
						</Row>
					</Card.Body>
				</Card>
			</Col>
		</Row>
	);
};

export default Version_02_01_00;
