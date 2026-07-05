// import node module libraries
import { Fragment } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router'
import { Col, Row, ListGroup } from 'react-bootstrap';

// import custom components
import { AvatarGroup, Avatar } from 'components//bootstrap/Avatar';

// import routes file
// Here we have used routers list of Projects->Single-> all children
// If you are changing main routes titles, you also need to modify on this component.
import { DashboardMenu } from 'routes/dashboard/DashboardRoutes';

const CommonHeaderTabs = () => {
	const location = useRouter();
	return (
		<Fragment>
			<Row>
				<Col lg={12} md={12} xs={12} className="mb-2">
					{/*  Page header */}
					<div
						className="d-lg-flex
                align-items-center justify-content-between"
					>
						<div className="mb-2 mb-lg-0">
							<h1 className="mb-0 h2 fw-bold">
								SAS - Dashboard 
							</h1>
						</div>
					
					</div>
				</Col>
			</Row>

			<Row>
				<Col xs={12} className="mb-4">
					<ListGroup as="ul" bsPrefix="nav nav-lb-tab">
						{DashboardMenu.filter(function (dataSource) {
							return dataSource.title === 'Projects';
						}).map((menu, index) => {
							return (
								<Fragment key={index}>
									{menu.children
										.filter(function (dataSource) {
											return dataSource.title === 'Single';
										})
										.map((menuItem, index) => {
											return (
												<Fragment key={index}>
													{menuItem.children.map(
														(subMenuItem, subMenuItemIndex) => {
															return (
																<ListGroup.Item
																	key={subMenuItemIndex}
																	as="li"
																	bsPrefix="nav-item"
																	className={`${subMenuItemIndex === 0 ? 'ms-0 me-3' : ''
																		} mx-3`}
																>
																	<Link
																		href={subMenuItem.link}
																		className={`nav-link mb-sm-3 mb-md-0 ${location.pathname === subMenuItem.link
																				? 'active'
																				: ''
																			}`}>
																		{subMenuItem.name}
																	</Link>
																</ListGroup.Item>
															);
														}
													)}
												</Fragment>
											);
										})}
								</Fragment>
							);
						})}
					</ListGroup>
				</Col>
			</Row>
		</Fragment>
	);
};

export default CommonHeaderTabs;
