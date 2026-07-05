// import node module libraries
import { Fragment } from 'react';
import { useMediaQuery } from 'react-responsive';
import { NavDropdown} from 'react-bootstrap';

// import hooks
import useMounted from 'hooks/useMounted';

const DocumentMenu = () => {
    const hasMounted = useMounted();
    const isDesktop = useMediaQuery({
        query: '(min-width: 1224px)'
    })   
    const DocumentationsMenuHTML = () => {
        return (
            <div className="ms-3 lh-3">
                <h5 className="mb-0">Documentations (Coming Soon)</h5>
                <p className="mb-0 fs-6">Browse the all documentation</p>
            </div>
        )
    }
    const ChangelogMenuHTML = () => {
        return (
            <div className="ms-3 lh-3">
                <h5 className="mb-0">
                    Changelog <span className="text-primary ms-1">v1.1.0</span>
                </h5>
                <p className="mb-0 fs-6">See what&apos;s new (Coming Soon)</p>
            </div>
        )
    }
    const DocMenuMobile = () => {
        return (
            <NavDropdown
                title="..."
                id="basic-nav-dropdown"
                bsPrefix="no-dropdown-arrow d-block nav-link fs-3 lh-1 pt-0"
            >
                <NavDropdown.Item
                    href="#"
                    className="py-2 px-3"
                >
                    <div className="d-flex align-items-center">
                        <i className="fe fe-file-text fs-3 text-primary"></i>
                        <DocumentationsMenuHTML />
                    </div>
                </NavDropdown.Item>
                <NavDropdown.Item
                    href="#"
                    className="py-2 px-3"
                >
                    <div className="d-flex align-items-center">
                        <i className="fe fe-layers fs-3 text-primary"></i>
                        <ChangelogMenuHTML/>
                    </div>
                </NavDropdown.Item>
            </NavDropdown>
        )
    }

    const DocMenuDesktop = () => {
        return (
            <NavDropdown
                title="..."
                id="basic-nav-dropdown"
                bsPrefix="no-dropdown-arrow d-block nav-link fs-3 lh-1 pt-0"
                show
            >
                <NavDropdown.Item
                    href="#"
                    className="py-2 px-3"
                >
                    <div className="d-flex align-items-center">
                        <i className="fe fe-file-text fs-3 text-primary"></i>
                        <DocumentationsMenuHTML />
                    </div>
                </NavDropdown.Item>
                <NavDropdown.Item
                    href="#"
                    className="py-2 px-3"
                >
                    <div className="d-flex align-items-center">
                        <i className="fe fe-layers fs-3 text-primary"></i>
                        <ChangelogMenuHTML/>
                    </div>
                </NavDropdown.Item>
            </NavDropdown>
        )
    }

    return (
        <Fragment>
            { hasMounted && isDesktop ? <DocMenuDesktop /> : <DocMenuMobile />}
        </Fragment>
    )
}

export default DocumentMenu;