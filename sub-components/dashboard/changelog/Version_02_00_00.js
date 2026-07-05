// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_02_00_00 = () => {
	const NewSass = [
		'/styles/theme/components/_breadcrumb.scss',
		'/styles/theme/components/_password.scss',
		'/styles/theme/root/*.*',
		'/styles/theme/_root.scss',
		'/styles/theme/vendor/nouislider/_nouislider.scss',
		'/styles/theme/vendor/lightbox/_lightbox.scss',
		'/styles/theme/vendor/map/_map.scss',
	]
	const UpdatedSass = [
		'/styles/theme/utilities/_background.scss',
		'/styles/theme/utilities/_border.scss',
		'/styles/theme/utilities/_icon-shape.scss',
		'/styles/theme/utilities/_sizing.scss',
		'/styles/theme/utilities/_text.scss',
		'/styles/theme/vendor/apex-chart/_apexchart.scss',
		'/styles/theme/vendor/flatpickr/_flatpickr.scss',
		'/styles/theme/vendor/modal-video/_modal-video.scss',
		'/styles/theme/vendor/quill/_quill-snow.scss',
		'/styles/theme/vendor/slick-slider/_slick_slider.scss',
		'/styles/theme/vendor/slick-slider/_slick-theme.scss',
		'/styles/theme/vendor/stepper/_stepper.scss',
		'/styles/theme/vendor/tag-input/_tag-input.scss',
		'/styles/theme/vendor/tippyjs/_tippy.scss',
		'/styles/theme/_theme.scss',
		'/styles/theme/_utilities.scss',
		'/styles/theme/_variables.scss',
		'/styles/theme.scss'
	]
	const NewMedia = [
		'/public/images/hero/hero-icon-bg-dark.svg',
		'/public/images/job/*.*',
		'/public/images/png/*.*',
	]
	const NewRoutes = [
		'/routes/marketing/JobListingRoutes.js',
		'/routes/marketing/NavbarMegaMenuRoutes.js',
		'/routes/marketing/HelpCenterRoutes.js',
	]

	const NewReactFiles = [
		'app.config.js',
		'/store/appSlice.js',
		'/layouts/DarkLightMode.js',
		'/layouts/marketing/AcademyLayout.js',
		'/layouts/marketing/JobListingLayout.js',
		'/layouts/marketing/AcademyLayout.js',
		'/layouts/marketing/navbars/mega-menu/*.*',
		'/layouts/marketing/HelpCenterDefaultLayout.js',
		'/layouts/marketing/navbars/help-center/HelpCenterDropDown.js',
		'/layouts/marketing/navbars/help-center/HelpCenterTransparentLayout.js',
		'/widgets/cards/*.*',
		'/widgets/lightbox/GKLightbox.js',
		'/widgets/range-slider/RangeSlider.js',
		'/widgets/testimonials/TestimonialsSlider.js',
		'/widgets/testimonials/TestimonialCard3.js',
		'/widgets/stepper/GKStepper2.js',
		'/widgets/stats/StatTopSVGIcon.js',
		'/widgets/stats/StatTopBigIcon.js',
		'/widgets/call-to-action/CTALightBG.js',
		'/widgets/call-to-action/CTA2Buttons.js',
		'/widgets/clientlogos/LogosTopHeadingOffset2.js',
		'/sub-components/quiz/Question.js',
		'/sub-components/jobs/*.*'
	]
	const UpdatedReactFiles = [
		'/pages/index.js',
		'/store/store.js',
		'/routes/marketing/NavbarDefault.js',
		'/routes/marketing/InstructorDashboard.js',
		'/routes/marketing/StudentDashboardMenu.js',
		'/layouts/marketing/navbars/NavbarLanding.js',
		'/layouts/marketing/navbars/help-center/NavbarHelpCenter.js',
		'/widgets/miscellaneous/GridListViewButton.js',
		'/widgets/from-select/FormSelect.js',
		'/widgets/ratings/Ratings.js',
		'/helper/utils.js'
	]
	const DeletedReactFiles = [
		'/layouts/marketing/footers/FooterLandings.js'
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
										<code>v2.0.0</code> - Feb 02, 2023
									</h5>
								</div>
							</Col>
							<Col lg={9} md={8} sm={12}>
								<div>
									<h4 className="mb-1 fw-semi-bold">Geeks NextJS Update [ <span className="text-danger">Breaking Update</span> ]</h4>
									<ul>
										<li>Updated Symantic and UI Changes</li>
										<li>Added academy landing page with Mega Menu</li>
										<li>Quiz pages for students and instructor</li>
										<li>Job Listing Pages</li>
										<li>Table improvements</li>
										<li>Dark/Light Mode</li>
										<li>Required packages are Updated</li>
										<li>Added <code>nouislider-react</code> package</li>
										<li>Added <code>yet-another-react-lightbox</code> package</li>
										<li>Fixed a few bugs</li>
										<li>Added/Updated required data and media files for react components.</li>
									</ul>

								</div>
								<div className="mb-3">
									<h4>New Components / Layout / React Files:</h4>
									<ul>
										{NewReactFiles.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
								<div className="mb-3">
									<h4>New Routes:</h4>
									<ul>
										{NewRoutes.map((item, index) => {
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
										{NewMedia.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
										<li><code>/public/images/background/*.*</code>
											<span className="comment d-block">( Added some new files)</span>
										</li>
										<li><code>/public/images/path/*.*</code>
											<span className="comment d-block">( Replaced all JPGs to SVGs)</span>
										</li>
										<li><code>/public/images/svg/*.*</code>
											<span className="comment d-block">( Added some new files)</span>
										</li>

									</ul>
								</div>
								<div className="mb-3">
									<h4>Updated React Files:</h4>
									<ul>
										<li>
											Updated all required react files consiering new pages, symantic UI, table improvements and dark/light mode facilities integration.
											<br />A few major updated files are...
										</li>
										{UpdatedReactFiles.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
								<div className="mb-3">
									<h4>Updated SCSS Files:</h4>
									<ul>
										<li><code>/styles/scss/theme/components/*.*</code>
											<span className="comment d-block">( Excluding _gallery.scss, _ie.scss  and _reboot.scss files )
											</span></li>
										{UpdatedSass.map((item, index) => {
											return (<li key={index}><code>{item}</code></li>)
										})}
									</ul>
								</div>
								<div className="mb-3">
									<h4>Deleted React Files:</h4>
									<ul>
										{DeletedReactFiles.map((item, index) => {
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

export default Version_02_00_00;
