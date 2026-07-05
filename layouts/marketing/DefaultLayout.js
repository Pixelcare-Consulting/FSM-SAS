// import node module libraries
import React, { Fragment, useEffect } from 'react';

// import layouts
import NavbarDefault from 'layouts/marketing/navbars/NavbarDefault';
import Footer from 'layouts/marketing/footers/Footer';

const DefaultLayout = (props) => {
	useEffect(() => {
		document.body.className = 'bg-light';
	});
	return (
		<Fragment>
			{/* <NavbarDefault login /> */}
			<main>
				{props.children}
			</main>
			{/* <Footer bgColor="bg-light" /> */}
		</Fragment>
	);
};

export default DefaultLayout;
