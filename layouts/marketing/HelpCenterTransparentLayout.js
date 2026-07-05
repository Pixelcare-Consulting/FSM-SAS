// import node module libraries
import { Fragment, useEffect } from 'react';
import FooterWithLinks from './footers/FooterWithLinks';
import NavbarHelpCenter from './navbars/help-center/NavbarHelpCenter';

const HelpCenterLayout = (props) => {
	useEffect(() => {
		document.body.className = 'bg-white';
	});
	return (
		<Fragment>
			<NavbarHelpCenter bg="transparent" className="navbar-transparent" />
			<main>
				{props.children}
			</main>
			<FooterWithLinks />
		</Fragment>
	);
};

export default HelpCenterLayout;
