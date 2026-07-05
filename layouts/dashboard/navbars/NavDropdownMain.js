import Link from 'next/link';
import { Fragment } from 'react';
import { NavDropdown, Badge } from 'react-bootstrap';
import { useMediaQuery } from 'react-responsive';
import * as Icons from 'react-bootstrap-icons';
import { FaChevronDown } from 'react-icons/fa';
import useMounted from 'hooks/useMounted';

const NavDropdownMain = (props) => {
	const { item, onClick } = props;
	const hasMounted = useMounted();
	const isDesktop = useMediaQuery({
		query: '(min-width: 1224px)'
	});

	const renderIcon = (iconName, dropdownRow = false) => {
		if (!iconName) return null;
		const IconComponent = Icons[iconName];
		if (!IconComponent) return null;
		return (
			<IconComponent
				size={16}
				className={dropdownRow ? 'flex-shrink-0' : 'me-2'}
			/>
		);
	};

	const renderBadge = (badge, dropdownRow = false) => {
		if (!badge) return null;
		return (
			<Badge
				pill
				bg="primary"
				className={
					dropdownRow
						? 'flex-shrink-0 text-uppercase'
						: 'ms-2 align-middle text-uppercase'
				}
				style={{
					fontSize: '0.625rem',
					fontWeight: 700,
					letterSpacing: '0.08em',
					padding: '0.28em 0.55em',
					lineHeight: 1,
					color: '#fff',
					boxShadow: '0 1px 2px rgba(13, 110, 253, 0.25)',
				}}
			>
				{badge}
			</Badge>
		);
	};

	const renderMenuItem = (menuItem) => (
		<NavDropdown.Item
			key={menuItem.id}
			as={Link}
			href={menuItem.link}
			className="dropdown-item"
			onClick={(expandedMenu) => onClick(!expandedMenu)}
		>
			<span className="d-flex align-items-center flex-nowrap gap-2">
				{renderIcon(menuItem.icon, true)}
				<span className="text-nowrap">{menuItem.menuitem}</span>
				{menuItem.badge ? renderBadge(menuItem.badge, true) : null}
			</span>
		</NavDropdown.Item>
	);

	const renderNavLink = () => (
		<Link 
			href={item.link} 
		className="nav-link d-flex align-items-center dashboard-nav-plain-link"
		style={{ 
			padding: '12px 16px',
			fontWeight: 500,
			color: '#212529',
			whiteSpace: 'nowrap',
		}}
			onClick={(e) => onClick && onClick(e)}
		>
			{renderIcon(item.icon)}
			<span>{item.menuitem}</span>
			{item.badge && renderBadge(item.badge)}
		</Link>
	);

	const NavbarDesktop = () => {
		return (
			<NavDropdown
				title={
					<span className="d-flex align-items-center" style={{ 
						padding: '0',
						fontWeight: 500
					}}>
						{renderIcon(item.icon)}
						{item.menuitem} 
						{item.badge && renderBadge(item.badge)}
						<FaChevronDown className="ms-2 text-muted" size={12} />
					</span>
				}
				show
				className="nav-item"
			>
				{item.children.map((submenu) => {
					if (submenu.header) {
						return (
							<h4 className="dropdown-header" key={submenu.id}>
								{submenu.header_text}
							</h4>
						);
					} else if (submenu.children) {
						return (
							<NavDropdown
								title={
									<span>
										{renderIcon(submenu.icon)}
										{submenu.menuitem}
									</span>
								}
								key={submenu.id}
								bsPrefix="dropdown-item d-block"
								className="dropdown-submenu dropend py-0"
								show
							>
								{submenu.children.map((subItem) =>
									subItem.header ? (
										<h5 className="dropdown-header text-dark" key={subItem.id}>
											{subItem.header_text}
										</h5>
									) : (
										renderMenuItem(subItem)
									)
								)}
							</NavDropdown>
						);
					} else {
						return renderMenuItem(submenu);
					}
				})}
			</NavDropdown>
		);
	};

	const NavbarMobile = () => {
		return (
			<NavDropdown 
				title={
					<span className="d-flex align-items-center" style={{ 
						fontWeight: 500,
						width: '100%'
					}}>
						{renderIcon(item.icon)}
						<span>{item.menuitem}</span>
						{item.badge && renderBadge(item.badge)}
						<FaChevronDown className="ms-auto text-muted" size={12} />
					</span>
				}
				className="mobile-dropdown w-100"
			>
				{item.children.map((submenu, submenuindex) => {
					if (submenu.divider || submenu.header) {
						return submenu.divider ? (
							<NavDropdown.Divider bsPrefix="mx-3" key={submenuindex} />
						) : (
							<h4 className="dropdown-header" key={submenuindex}>
								{submenu.header_text}
							</h4>
						);
					} else {
						if (submenu.children === undefined) {
							return (
								<NavDropdown.Item
									key={submenuindex}
									as={Link}
									href={submenu.link}
									className="dropdown-item"
									onClick={(expandedMenu) => onClick(!expandedMenu)}
								>
									<span className="d-flex align-items-center flex-nowrap gap-2">
										{renderIcon(submenu.icon, true)}
										<span className="text-nowrap">{submenu.menuitem}</span>
										{submenu.badge ? renderBadge(submenu.badge, true) : null}
									</span>
								</NavDropdown.Item>
							);
						} else {
							return (
								<NavDropdown
									title={submenu.menuitem}
									key={submenuindex}
									bsPrefix="dropdown-item d-block"
									className={`dropdown-submenu dropend py-0 `}
								>
									{submenu.children.map((submenuitem, submenuitemindex) => {
										if (submenuitem.divider || submenuitem.header) {
											return submenuitem.divider ? (
												<NavDropdown.Divider
													bsPrefix="mx-3"
													key={submenuitemindex}
												/>
											) : (
												<Fragment key={submenuitemindex}>
													<h5 className="dropdown-header text-dark">
														{submenuitem.header_text}
													</h5>
													<p className="dropdown-text mb-0 text-wrap">
														{submenuitem.description}
													</p>
												</Fragment>
											);
										} else {
											return (
												<Fragment key={submenuitemindex}>
													{submenuitem.type === 'button' ? (
														<div className="px-3 d-grid">
															<Link href={submenuitem.link} className="btn-sm btn-primary text-center">
																{submenuitem.menuitem}
															</Link>
														</div>
													) : (
														<NavDropdown.Item
															as={Link}
															href={submenuitem.link}
															className="btn-sm btn-primary dropdown-item"
															onClick={(expandedMenu) => onClick(!expandedMenu)}>
															<span className="d-flex align-items-center flex-nowrap gap-2">
																<span className="text-nowrap">{submenuitem.menuitem}</span>
																{submenuitem.badge ? renderBadge(submenuitem.badge, true) : null}
															</span>
														</NavDropdown.Item>
													)}
												</Fragment>
											);
										}
									})}
								</NavDropdown>
							);
						}
					}
				})}
			</NavDropdown>
		);
	}
	return (
		<Fragment>
			{hasMounted && (
				item.children && item.children.length > 0 ? (
					isDesktop ? <NavbarDesktop /> : <NavbarMobile />
				) : (
					renderNavLink()
				)
			)}
		</Fragment>
	);
};

export default NavDropdownMain;
