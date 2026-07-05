// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_02_00_01 = () => {
	const NewSass = [
		'/styles/theme/vendor/dropzone/_dropzone.scss',
		'/styles/theme/components/_pagination.scss'
	]
	const UpdatedSass = [
		'/styles/theme/vendor/slick-slider/_slick_slider.scss',
		'/styles/theme/vendor/nouislider/_nouislider.scss',
		'/styles/theme/vendor/prism/_prism.scss',
		'/styles/theme.scss'
	]
	const NewReactFiles = [
		'/widgets/tooltips/GKTippy.js',
		'/hooks/useLocalStorage.js'
	]
	const DeletedReactFiles = [
		'/widgets/tooltips/GKTooltip.js'
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
										<code>v2.0.1</code> - Mar 07, 2023
									</h5>
								</div>
							</Col>
							<Col lg={9} md={8} sm={12}>
								<div>
									<h4 className="mb-1 fw-semi-bold">Geeks NextJS Update</h4>
									<ul>
										<li>Fixed UI issues for dark mode</li>
										<li>Fixed a few bugs</li>
										<li>Replaced all <code>&lt;Tippy&gt;</code> tooltip with custom <code>&lt;GKTippy&gt;</code> component</li>
										<li>Replaced all <code>&lt;GKTooltip&gt;</code> component with <code>&lt;GKTippy&gt;</code> component</li>
										<li>Moved <code>&lt;QuickMenu&gt;</code> sub componet at <code>/layout/QuickMenu</code> and included in required layouts</li>
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
									<h4>Updated SCSS Files:</h4>
									<ul>
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

export default Version_02_00_01;
