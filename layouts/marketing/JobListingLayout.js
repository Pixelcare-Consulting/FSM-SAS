// import node module libraries
import React, { Fragment } from 'react';

// import layouts
import NavbarJobPages from 'layouts/marketing/navbars/NavbarJobPages';
import FooterWithLinks from 'layouts/marketing/footers/FooterWithLinks';

const JobListingLayout = (props) => {
    return (
        <Fragment>
            <NavbarJobPages />
            {props.children}
            <FooterWithLinks />
        </Fragment>
    )
}

export default JobListingLayout