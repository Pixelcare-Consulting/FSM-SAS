// import node module libraries
import { Fragment, useState, useEffect } from 'react';
import { useMediaQuery } from 'react-responsive';
import PropTypes from 'prop-types';
import Link from 'next/link';
import {
	Image,
	Navbar,
	Nav,
	Container,
	Form,
} from 'react-bootstrap';

// import sub components
import QuickMenu from 'layouts/QuickMenu';

// import data files
import NavbarDefaultRoutes from 'routes/marketing/NavbarDefault';

// import layouts
import NavDropdownMain from 'layouts/marketing/navbars/NavDropdownMain';
import DocumentMenu from 'layouts/marketing/navbars/DocumentMenu';

// import hooks
import useMounted from 'hooks/useMounted';

const NavbarDefault = ({ login = false }) => {
	const [expandedMenu, setExpandedMenu] = useState(false);
	const hasMounted = useMounted();

	const isDesktop = useMediaQuery({
		query: '(min-width: 1224px)'
	});
	const isLaptop = useMediaQuery({
		query: '(min-width: 1024px)'
	});

	return (
        <Fragment>
            <Navbar
				onToggle={(collapsed) => setExpandedMenu(collapsed)}
				expanded={expandedMenu}
				expand="lg"
				className="navbar p-2 navbar-default py-2"
			>
				<Container fluid className="px-0 ps-2">
					<Link href="/">
                        {/* @next-codemod-error This Link previously used the now removed `legacyBehavior` prop, and has a child that might not be an anchor. The codemod bailed out of lifting the child props to the Link. Check that the child component does not render an anchor, and potentially move the props manually to Link. */
                        }
                        <Navbar.Brand>
							<Image src="/images/brand/logo/logo.svg" alt="" />
						</Navbar.Brand>
                    </Link>
					{hasMounted ?
						<div className={`navbar-nav navbar-right-wrap ms-auto d-lg-none nav-top-wrap ${login ? (isDesktop || isLaptop ? 'd-none' : 'd-flex') : 'd-none'}`}>
							<QuickMenu />
						</div>
						: null}
					<Navbar.Toggle aria-controls="basic-navbar-nav">
						<span className="icon-bar top-bar mt-0"></span>
						<span className="icon-bar middle-bar"></span>
						<span className="icon-bar bottom-bar"></span>
					</Navbar.Toggle>
					<Navbar.Collapse id="basic-navbar-nav">
						<Nav>
							{NavbarDefaultRoutes.map((item, index) => {
								if (item.children === undefined) {
									return (
										<Nav.Link
											key={index}
											as={Link}
											href={item.link}>
											{item.menuitem}
										</Nav.Link>
									);
								} else if (hasMounted) {
									return (
										<NavDropdownMain
											item={item}
											key={index}
											onClick={(value) => setExpandedMenu(value)}
										/>
									);
								} else {
									return null;
								}
							})}
							{hasMounted ? <DocumentMenu /> : null}
						</Nav>
						{/* Search Form */}
						<Form className="mt-3 mt-lg-0 ms-lg-3 d-flex align-items-center">
							<span className="position-absolute ps-3 search-icon">
								<i className="fe fe-search"></i>
							</span>
							<Form.Control
								type="Search"
								id="formSearch"
								className="ps-6"
								placeholder="Search Courses"
							/>
						</Form>
						{/* Right side quick / shortcut menu  */}

						<div className='ms-auto d-flex align-items-center'>


							<Nav className="navbar-nav navbar-right-wrap ms-auto d-flex nav-top-wrap">
								<span className={login ? 'ms-auto mt-3 mt-lg-0 d-none' : 'ms-auto mt-3 mt-lg-0'}>
									<Nav.Link
										href="#"
										bsPrefix="btn"
										className="btn btn-white shadow-sm me-2"
									>
										Sign In
									</Nav.Link>
									<Nav.Link
										href="#"
										bsPrefix="btn"
										className="btn btn-primary shadow-sm"
									>
										Sign Up
									</Nav.Link>
								</span>
								{hasMounted ?
									<span
										className={`${login
											? isDesktop || isLaptop
												? 'd-flex'
												: 'd-none'
											: 'd-none'
											}`}
									>
										<QuickMenu />
									</span>
									: null}
							</Nav>
						</div>
						{/* end of right side quick / shortcut menu  */}
					</Navbar.Collapse>
				</Container>
			</Navbar>
        </Fragment>
    );
};

// Typechecking With PropTypes
NavbarDefault.propTypes = {
	login: PropTypes.bool
};

export default NavbarDefault;
