// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_02_02_00 = () => {

	const NewSass = [
		'/styles/theme/vendor/bs-stepper/_bs-stepper.scss',
	]
	const UpdatedSass = [
		'/styles/theme/_theme.scss',
		'/styles/themes/_variables.scss',
		'/styles/theme/components/_table.scss',
		'/styles/theme/vendor/slick-slider/_slick.scss'
	]
	const NewMediaFiles = [
		'/public/images/ecommerce/*.*',
		'/public/images/education/*.*',
		'/public/images/portfolio/*.*',
		'/public/images/svg/graphics-1.svg',
		'/public/images/svg/graphics-2.svg',
	];

	const NewReactFiles = [
		'/hooks/useCartOperations.js',
		'/pages/marketing/landings/landing-education.js',
		'/pages/marketing/portfolio/list.js',
		'/pages/marketing/portfolio/single.js',
		'/pages/dashboard/ecommerce/*.*',
		'/pages/dashboard/tables/*.*',
		'/sub-components/landings/education/*.*',
		'/sub-components/portfolio/*.*',
		'/sub-components/data-table/*.*',
		'/widgets/advance-table/TanstackTable.js',
		'/widgets/cards/SkillCourseCard.js',
		'/widgets/cards/WebinarCard.js',
		'/widgets/clientlogos/LogosTopHeading3.js',
		'/widgets/ratings/RatingsBiIcon.js',
		'/widgets/tables/*.*',
		'/store/cartSlice.js',
	]

	const UpdatedReactFiles = [
		'/layouts/DarkLightMode.js',
		'/widgets/lightbox/GKLightbox.js',
		'/widgets/advance-table/GlobalFilter.js',
		'/widgets/advance-table/Checkbox.js',
		'/widgets/advance-table/Pagination.js',
		'/widgets/index.js',
		'/sub-components/index.js',
		'/sub-components/quiz/quiz-start/QuizTimer.js',
		'/routes/dashboard/DashboardRoutes.js',
		'/routes/dashboard/NavbarTopRoutes.js',
		'/routes/marketing/NavbarDefault.js',
		'/helper/utils.js',
		'/store/store.js',
		'/pages/_app.js'
	]

	const NewDataFiles = [
		'/data/marketing/portfolio/*.*',
		'/data/marketing/landing-education/*.*',
		'/data/dashboard/customers/*.*',
		'/data/dashboard/ecommerce/*.*',
		'/data/dashboard/tables/*.*',
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
										<code>v2.2.0</code> - November 29, 2023
									</h5>
								</div>
							</Col>
							<Col lg={9} md={8} sm={12}>
								<div>
									<h4 className="mb-1 fw-semi-bold">Geeks NextJS Update</h4>
									<ul>
										<li>Required packages are updated with <code>nextjs 14.x</code></li>
										<li>Fixed a few bugs</li>
										<li>
											Added below new packages<br />
											<code>@tanstack/react-table</code> ( removed <code>react-table</code> )<br />
											<code>react-moment</code><br />
											<code>react-data-table-component</code> <br />
											<code>styled-components</code> (as a required dev-dependency for react-data-table-component)<br />
										</li>
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
									<h4>New Media Files:</h4>
									<ul>
										{NewMediaFiles.map((item, index) => {
											return (
												<li key={index}>
													<code>{item}</code>
												</li>
											);
										})}
									</ul>
								</div>

								<div className="mb-3">
									<h4>New Data Files:</h4>
									<ul>
										{NewDataFiles.map((item, index) => {
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
									(Note: Updated all react pages in which react-table was used by replacing @tanstack/react-table )

								</div>

								<div className="mb-3">
									<h4>Updated SCSS Files:</h4>
									<ul>
										{UpdatedSass.map((item, index) => {
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

export default Version_02_02_00;
