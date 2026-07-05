// import node module libraries
import Link from 'next/link';
import { Col, Row, Image } from 'react-bootstrap';

// import Supabase for company logo
import { getSupabaseClient } from '../../../lib/supabase/client';
import { useState, useEffect } from 'react';

const NavbarBrandOnly = () => {
	// Add loading state
	const [isLoading, setIsLoading] = useState(true);
	const [logo, setLogo] = useState(null); // Initialize as null instead of default value

	useEffect(() => {
		const fetchCompanyInfo = async () => {
			try {
				const supabase = getSupabaseClient();
				if (supabase) {
					const { data: companyData } = await supabase
						.from('company_details')
						.select('logo')
						.eq('id', 'companyInfo')
						.single();
					setLogo(companyData?.logo || '/images/SAS-LOGO.png');
				} else {
					setLogo('/images/SAS-LOGO.png');
				}
			} catch (error) {
				console.error('Error fetching company info:', error);
				setLogo('/images/SAS-LOGO.png');
			} finally {
				setIsLoading(false);
			}
		};

		fetchCompanyInfo();
	}, []);

	// Show nothing while loading
	if (isLoading || !logo) {
		return null;
	}

	return (
        <Row>
            <Col xl={{ offset: 1, span: 2 }} lg={12} md={12}>
				<div className="mt-4">
					<Link href="/">
						<Image src={logo} alt="Company Logo" style={{ maxHeight: '100px', width: 'auto' }} />
					</Link>
				</div>
			</Col>
        </Row>
    );
};
export default NavbarBrandOnly;
