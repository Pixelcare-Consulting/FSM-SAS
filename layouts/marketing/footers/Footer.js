// import node module libraries
import React from 'react';
import Link from 'next/link';
import PropTypes from 'prop-types';
import { Row, Col, Container } from 'react-bootstrap';

const Footer = ({ bgColor }) => {
	return (
		<footer className={`footer ${bgColor}`}>
			<Container>
				<Row className="align-items-center g-0 border-top py-2">
					{/* Desc */}
					<Col md={6} sm={12} className="text-center text-md-start">
						<span>© 2024 Geeks. All Rights Reserved.</span>
					</Col>
					{/* Links */}
					<Col md={6} sm={12}>
						<nav className="nav nav-footer justify-content-center justify-content-md-end">
							<Link href="/" className="nav-link active ps-0">
								Privacy
							</Link>
							<Link href="/" className="nav-link">
								Terms
							</Link>
							<Link href="/" className="nav-link">
								Feedback
							</Link>
							<Link href="/" className="nav-link">
								Support
							</Link>
						</nav>
					</Col>
				</Row>
			</Container>
		</footer>
	);
};

// Specifies the default values for props
Footer.defaultProps = {
	bgColor: 'bg-light'
};

// Typechecking With PropTypes
Footer.propTypes = {
	bgColor: PropTypes.string
};

export default Footer;
