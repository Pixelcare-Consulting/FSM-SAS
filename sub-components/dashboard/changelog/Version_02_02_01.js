// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_02_02_01 = () => {

	const UpdatedReactFiles = [
		'/layouts/marketing/HelpCenterTransparentLayout.js',
		'/layouts/marketing/navbars/mega-menu/MegaMenu.js',
		'/sub-components/dashboard/ecommerce/ProductsTable.js',
		'/sub-components/dashboard/ecommerce/orders/OrdersTable.js',
		'/sub-components/help-center/help-center-default/HeroGradientHeader.js',
		'/widgets/maps/UsersbyCountry.js',
		'/widgets/tables/TableDark.js',
		'/pages/dashboard/tables/datatables.js',
	]
	const UpdatedSass = [
		'/styles/themes/_variables.scss'
	]
	const UpdatedDataFiles = [
		'/data/dashboard/ecommerce/ProductsData.js',
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
										<code>v2.2.1</code> - February 01, 2024
									</h5>
								</div>
							</Col>
							<Col lg={9} md={8} sm={12}>
								<div>
									<h4 className="mb-1 fw-semi-bold">Geeks NextJS Update</h4>
									<ul>
										<li>Required packages are updated.</li>
										<li>Mobile menu issue fixed</li>
										<li>Fixed a few bugs</li>
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
									<h4>Updated Data Files:</h4>
									<ul>
										{UpdatedDataFiles.map((item, index) => {
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


							</Col>
						</Row>
					</Card.Body>
				</Card>
			</Col>
		</Row>
	);
};

export default Version_02_02_01;
