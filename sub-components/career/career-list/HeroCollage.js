// import node module libraries
import Link from 'next/link';
import { Col, Row, Container } from 'react-bootstrap';

const HeroCollage = () => {
	return (
		<section className="py-md-14 py-8 bg-white">
			<Container>
				<Row className="align-items-center">
					<Col xl={6} lg={6} xs={12}>
						<div className="mb-5  ">
							<h1 className="display-3 mb-4 fw-bold ">
								Join the team, we’re growing fast!
							</h1>
							<p className="lead mb-4 pe-xl-12 ">
								We’re looking for incredible people to build on our strong
								momentum. Help us power the brands you know and love.
							</p>
							<Link href="#position" className="btn btn-primary">
								See All Open Positions
							</Link>
							<p className=" mt-4 mb-0">
								69 open positions across and <Link href="#">all offices</Link> and{' '}
								<Link href="#">all teams</Link>.
							</p>
						</div>
					</Col>
					<Col lg={6} xs={12}>
						<Row>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-12rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-6.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-18rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-8.jpg')` }}
								></div>
							</Col>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-18rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-10.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-18rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-11.jpg')` }}
								></div>
							</Col>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-13rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-12.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-13rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-13.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-13rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-14.jpg')` }}
								></div>
							</Col>
						</Row>
					</Col>
				</Row>
			</Container>
		</section>
	);
};

export default HeroCollage;
