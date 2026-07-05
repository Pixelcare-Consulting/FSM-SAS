// import node module libraries
import React, { useState } from 'react';

// import sub components
import NavbarVertical from './navbars/NavbarVertical';
import NavbarTop from './navbars/NavbarTop';
import { useSessionCheck } from '../../hooks/useSessionCheck';

const DashboardIndex = (props) => {
	const [showMenu, setShowMenu] = useState(true);
	useSessionCheck();
	const ToggleMenu = () => {
		return setShowMenu(!showMenu);
	};	
	return (		
		<div id="db-wrapper" className={`${showMenu ? '' : 'toggled'}`}>
			<div className="navbar-vertical navbar">
				<NavbarVertical
					showMenu={showMenu}
					onClick={(value) => setShowMenu(value)}
				/>
			</div>
			<main id="page-content">
				<header className="header">
					<NavbarTop
						data={{
							showMenu: showMenu,
							SidebarToggleMenu: ToggleMenu
						}}
					/>
				</header>
				<section style={{ width: "100%", maxWidth: "100%", paddingTop: "1.5rem", paddingBottom: "1.5rem" }}>{props.children}</section>
			</main>
		</div>
	);
};
export default DashboardIndex;
