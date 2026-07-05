// import node module libraries
import { Col, Row, Card } from 'react-bootstrap';

const Version_01_00_01 = () => {
    return (
        <Row>
            <Col lg={7} md={12} sm={12}>
                <Card>
                    <Card.Body>
                        <Row className="g-0">
                            <Col lg={3} md={4} sm={12}>
                                <div id="initial">
                                    <h5 className="mb-3 fwsemi--bold">
                                        <code>v1.0.1</code> - Dec 06, 2022
                                    </h5>
                                </div>
                            </Col>
                            <Col lg={9} md={8} sm={12}>
                                <div>
                                    <h4 className="mb-1 fw-semi-bold">Geeks NextJS Update</h4>
                                    <ul>
                                        <li>Updated bootstrap package from 5.2.0 to 5.2.3</li>
                                        <li>Updated react-bootstrap package from 2.4.0 to 2.6.0</li>
                                        <li>Updated next package from 12.2.3 to 13.0.5</li>
                                        <li>Updated eslint (devDependencies) package from package from 8.20.0 to 8.28.0</li>
                                        <li>Updated eslint-config-next (devDependencies) package from 12.2.3 to 13.0.5</li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="mb-1 fw-semi-bold">Updated React Files:</h4>
                                    <ul>
                                        <li>
                                            Updated all files which contains code <code>&lt;Link&gt;&lt;a&gt;&lt;&#47;a&gt;&lt;&#47;Link&gt;</code> tags, <br />
                                            considering the <b>NextJs 13 documentation</b> <a href="https://nextjs.org/docs/messages/invalid-new-link-with-extra-anchor" target="_blank">Link 1</a> and <a href="https://nextjs.org/docs/advanced-features/codemods#new-link" target="_blank">Link 2</a><br />
                                            <b>Don't panic !! </b>You just need to backup your code and apply single command i.e. <br />
                                            <code>npx @next/codemod new-link .</code> (including last dot)<br />
                                            Above command will remove <code>&lt;a&gt;&lt;&#47;a&gt;</code> which are written between <code>&lt;Link&gt;&lt;&#47;Link&gt;</code> tags and all attributes applied with <code>&lt;a&gt;</code> tag will be moved to <code>&lt;Link&gt;</code> tag.
                                        </li>
                                        <li>
                                            Above Change will not apply if Link tag is applied with <code>as</code> attribute like <code>as=&#x2774;Link&#x2775;</code>, so for that you need to modify those Links manually, for our project, we have modified below pages for the same.<br />
                                            <b>Note :</b> - After applying <code>npx @next/codemod new-link .</code> command search for <code>as=&#x2774;Link&#x2775;</code> <br /> and remove <code>&lt;a&gt;</code> tags between <code>&lt;Link&gt;</code> tags <br /> 
                                            <code>/layouts/dashboard/navbars/NavDropdownMain.js</code><br />
                                            <code>/layouts/dashboard/navbars/NavbarCompact.js</code><br />
                                            <code>/layouts/dashboard/DashboardIndexTop.js</code><br />
                                            <code>/layouts/marketing/navbars/NavbarDefault.js</code><br />
                                            <code>/layouts/marketing/navbars/NavbarHelpCenter.js</code><br />
                                            <code>/layouts/marketing/navbars/NavbarLanding.js</code><br />
                                            <code>/layouts/marketing/navbars/NavDropdownMain.js</code><br />
                                        </li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="mb-1 fw-semi-bold">Fixed code issues :</h4>
                                    <ul>                                       
                                        <li>
                                        Fixed Level Icon with tooltip issue, it was wrong import <br/>
                                        <code>/widget/headers/ProfileCover.js</code> 
                                        </li>
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

export default Version_01_00_01;
