// import node module libraries
import { Fragment } from 'react';

// import layouts files
import NavbarMegaMenu from 'layouts/marketing/navbars/mega-menu/NavbarMegaMenu';
import FooterWithLinks from 'layouts/marketing/footers/FooterWithLinks';

const AcademyLayout = (props) => {
    return (
        <Fragment>
            {/* Default Navbar */}
            <NavbarMegaMenu />
            <main>
                {props.children}
            </main>
            {/* Footer section */}
            <FooterWithLinks />
        </Fragment >
    )
}

export default AcademyLayout