// import node module libraries
import React from 'react';
import { Container } from 'react-bootstrap';

const AuthLayout = (props) => {
	return (
		<main>
			<section id="db-wrapper">
				<Container className="d-flex flex-column">{props.children}</Container>
			</section>
		</main>
	);
};
export default AuthLayout;
