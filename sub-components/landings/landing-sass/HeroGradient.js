// import node module libraries
import { Col, Row, Container, Image, ListGroup } from 'react-bootstrap';
import { useMediaQuery } from 'react-responsive';
import Link from 'next/link';


// import MDI icons
import Icon from '@mdi/react';
import { mdiCheckCircle } from '@mdi/js';

// import widget/custom components
import { LogosTopHeadingInverseDark } from 'widgets';

// import data files
import LogoList1 from 'data/clientlogos/LogoList2';

const HeroGradient = () => {
	const isLaptop = useMediaQuery({ maxWidth: 1024 });

	return (
		<section
			className="py-lg-14 py-10 position-relative bg-cover"
			style={{ backgroundImage: `url('/images/background/gradient-bg.png')` }}
		>
			{/* Image */}
			<Container>
				<Row className="align-items-center mb-6">
					<Col lg={7} xs={12} className="order-md-2">
						<div className="mb-2 mb-md-0 ">
							<Image
								src='/images/background/graphics.svg'
								alt=""
								className={`img-fluid ${isLaptop ? '' : 'mw-lg-130'}`}
							/>
						</div>
					</Col>
					<Col lg={5} xs={12} className="order-md-1">
						{/* Heading */}
						<h1 className="display-2 mb-5 fw-bold">
							Modern web apps shipped faster
						</h1>

						{/* list */}
						<ListGroup
							bsPrefix="list-unstyled"
							className="fs-3 text-dark mb-6 fw-medium"
						>
							<ListGroup.Item bsPrefix="mb-1" className="d-flex">
								<Icon
									path={mdiCheckCircle}
									size={0.9}
									className="text-success mt-1 me-2"
								/>{' '}
								Simple to use, beautiful UI design
							</ListGroup.Item>
							<ListGroup.Item bsPrefix="mb-1" className="d-flex">
								<Icon
									path={mdiCheckCircle}
									size={0.9}
									className="text-success mt-1 me-2"
								/>{' '}
								Complete complex project with ease
							</ListGroup.Item>
							<ListGroup.Item bsPrefix="mb-1" className="d-flex">
								<Icon
									path={mdiCheckCircle}
									size={0.9}
									className="text-success mt-1 me-2"
								/>{' '}
								An intuitive admin app for developers
							</ListGroup.Item>
						</ListGroup>

						{/* Buttons */}
						<div className="mb-8 mb-lg-0">
							<Link href="#" className="btn btn-primary me-3 mb-2 mb-lg-0">
								Get started for Free
							</Link>
							<Link href="#" className="text-nowrap btn-link">
								Questions? Talk to an expert
							</Link>
						</div>
					</Col>
				</Row>

				{/* Trusted By logo */}
				<LogosTopHeadingInverseDark
					title="TRUSTED BY MILLIONS OF DEVELOPERS & THOUSANDS OF ENTERPRISE TEAMS"
					logos={LogoList1}
					limit={5}
					inverse = {false}
				/>
			</Container>
		</section>
	);
};
export default HeroGradient;
