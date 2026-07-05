// import node module libraries
import React, { Fragment, useContext } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  Image,
  Dropdown,
  Navbar,
  Nav,
  Accordion,
  ListGroup,
  useAccordionButton,
  AccordionContext,
} from "react-bootstrap";

// import widget/custom components
import { GKTippy } from "widgets";

// import routes file
import { DashboardMenu } from "routes/dashboard/DashboardRoutes";

// import hooks
import useToggle from "hooks/useToggle";

const NavbarCompact = () => {
  const location = useRouter();

  const [expandedMenu, setExpandedMenu] = useToggle(false);

  const CustomToggle = React.forwardRef(({ children, onClick }, ref) => (
    <Link
      href=""
      className="nav-link"
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        onClick(e);
      }}
    >
      {children}
    </Link>
  ));
  CustomToggle.displayName = "CustomToggle";

  const AccordionToggle = ({ children, eventKey, className }) => {
    const { activeEventKey } = useContext(AccordionContext);
    const decoratedOnClick = useAccordionButton(eventKey, () =>
      console.log("Event Key : " + eventKey)
    );
    const isCurrentEventKey = activeEventKey === eventKey;
    return (
      <li className={`dropdown-submenu dropend dropdown-item ${className}`}>
        <Link
          href="#!"
          className="nav-link d-block dropdown-toggle"
          onClick={decoratedOnClick}
          data-bs-toggle="collapse"
          data-bs-target="#navDashboard"
          aria-expanded={isCurrentEventKey ? true : false}
          aria-controls="navDashboard"
        >
          {children}
        </Link>
      </li>
    );
  };
  AccordionToggle.displayName = "AccordionToggle";

  return (
    <Fragment>
      <div className="nav-scroller">
        {/* <Navbar.Brand
					as={Link}
					href="/dashboard/overview/"
					className='navbar-brand'>
					<Image
						src="/images/POTENSI-LOGO.png"
						alt=""
						height="30"
						className="text-inverse"
					/>
				</Navbar.Brand> */}
      </div>

      <Navbar bsPrefix="navbar-nav" className="flex-column" as="ul">
        {DashboardMenu.map(function (menu, index) {
          if (!menu.grouptitle) {
            if (menu.children) {
              return (
                <Fragment key={index}>
                  <Nav.Link
                    as="li"
                    bsPrefix="nav-item"
                    className="dropdown dropend"
                  >
                    {/* main menu / menu level 1 / root items */}
                    <Dropdown autoClose="outside">
                      <Dropdown.Toggle
                        as={CustomToggle}
                        id="dropdown-custom-components"
                      >
                        <i className={`nav-icon fe fe-${menu.icon}`}></i>
                      </Dropdown.Toggle>
                      <Dropdown.Menu
                        as="ul"
                        onToggle={(collapsed) => setExpandedMenu(collapsed)}
                        show={expandedMenu}
                      >
                        <Dropdown.Header as="li">{menu.title}</Dropdown.Header>
                        {menu.children.map(function (menuItem, menuItemIndex) {
                          if (menuItem.children) {
                            return (
                              <Fragment key={menuItemIndex}>
                                {/* second level menu started  */}
                                <Dropdown.Item
                                  as="li"
                                  bsPrefix=" "
                                  eventKey={menuItemIndex}
                                >
                                  <Accordion
                                    as="ul"
                                    className="navbar-nav flex-column"
                                  >
                                    <AccordionToggle eventKey={menuItemIndex}>
                                      {menuItem.title}
                                    </AccordionToggle>
                                    <Accordion.Collapse
                                      eventKey={menuItemIndex}
                                      as="li"
                                      bsPrefix="nav-item"
                                    >
                                      <ListGroup as="ul">
                                        {menuItem.children.map(
                                          (subItem, subItemIndex) => {
                                            if (subItem.children) {
                                              return (
                                                <ListGroup.Item
                                                  as="li"
                                                  bsPrefix=" "
                                                  key={subItemIndex}
                                                >
                                                  {/* third level menu started */}
                                                  <Accordion
                                                    as="ul"
                                                    className="navbar-nav flex-column"
                                                  >
                                                    <AccordionToggle
                                                      eventKey={subItem.id}
                                                      className="ps-5"
                                                    >
                                                      {subItem.title}
                                                    </AccordionToggle>
                                                    <Accordion.Collapse
                                                      eventKey={subItem.id}
                                                      as="li"
                                                      bsPrefix="nav-item"
                                                    >
                                                      <ListGroup as="ul">
                                                        {subItem.children.map(
                                                          (
                                                            thirdLevelItem,
                                                            thirdLevelItemIndex
                                                          ) => {
                                                            return (
                                                              <ListGroup.Item
                                                                as="li"
                                                                bsPrefix="dropdown-item"
                                                                className={`ps-6 ${
                                                                  location.pathname ===
                                                                  thirdLevelItem.link
                                                                    ? "active"
                                                                    : ""
                                                                }`}
                                                                key={
                                                                  thirdLevelItemIndex
                                                                }
                                                              >
                                                                <Link
                                                                  href={
                                                                    thirdLevelItem.link
                                                                  }
                                                                  className="ps-3"
                                                                >
                                                                  {
                                                                    thirdLevelItem.name
                                                                  }
                                                                </Link>
                                                              </ListGroup.Item>
                                                            );
                                                          }
                                                        )}
                                                      </ListGroup>
                                                    </Accordion.Collapse>
                                                  </Accordion>
                                                  {/* end of third level menu */}
                                                </ListGroup.Item>
                                              );
                                            } else {
                                              return (
                                                <ListGroup.Item
                                                  as="li"
                                                  bsPrefix="dropdown-item "
                                                  className={`ps-3 ${
                                                    location.pathname ===
                                                    subItem.link
                                                      ? "active"
                                                      : ""
                                                  }`}
                                                  key={subItemIndex}
                                                >
                                                  <Link
                                                    href={subItem.link}
                                                    className="ps-3"
                                                  >
                                                    {subItem.name}
                                                  </Link>
                                                </ListGroup.Item>
                                              );
                                            }
                                          }
                                        )}
                                      </ListGroup>
                                    </Accordion.Collapse>
                                  </Accordion>
                                </Dropdown.Item>
                                {/* end of second level */}
                              </Fragment>
                            );
                          } else {
                            return (
                              <Fragment key={menuItemIndex}>
                                {/* first level menu items */}
                                <Dropdown.Item
                                  as="li"
                                  eventKey={menuItemIndex}
                                  key={menuItemIndex}
                                  active={location.pathname === menuItem.link}
                                >
                                  <Link
                                    href={menuItem.link}
                                    className="d-block"
                                  >
                                    {menuItem.name}
                                  </Link>
                                </Dropdown.Item>
                                {/* end of first level menu items */}
                              </Fragment>
                            );
                          }
                        })}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Nav.Link>
                  {/* end of main menu / menu level 1 / root items */}
                </Fragment>
              );
            } else {
              return (
                <Nav.Link as="li" bsPrefix="nav-item" key={index}>
                  {/* menu item without any childern items like Documentation and Changelog items*/}
                  <GKTippy content={menu.title} placement="right">
                    <Link href={menu.link} className="nav-link">
                      {typeof menu.icon === "string" ? (
                        <i className={`nav-icon fe fe-${menu.icon} me-2`}></i>
                      ) : (
                        menu.icon
                      )}
                    </Link>
                  </GKTippy>
                  {/* end of menu item without any childern items */}
                </Nav.Link>
              );
            }
          }
          return true;
        })}
      </Navbar>
    </Fragment>
  );
};

export default NavbarCompact;
