// import node module libraries
import { Col, Row, Container } from 'react-bootstrap';

const Collage = () => {
	return (
		<section className="pt-5 bg-white">
			<Container fluid className="px-md-5">
				<Row>
					<Col lg={6} xs={12} className="d-none d-lg-block ">
						<Row>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-20rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-1.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-18rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-3.jpg')` }}
								></div>
							</Col>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-16rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-2.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-17rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-4.jpg')` }}
								></div>
							</Col>
							<Col md={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-20rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-5.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-19rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-7.jpg')` }}
								></div>
							</Col>
						</Row>
					</Col>
					<Col lg={6} xs={12}>
						<Row>
							<Col lg={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2 h-14rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-6.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2 h-22rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-8.jpg')` }}
								></div>
							</Col>
							<Col lg={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2  h-22rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-10.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2  h-24rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-11.jpg')` }}
								></div>
							</Col>
							<Col lg={4} xs={4} className="px-1">
								<div
									className="bg-cover rounded-3 mb-2  h-14rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-12.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2  h-16rem"
									style={{ backgroundImage: `url('/images/avatar/avatar-13.jpg')` }}
								></div>
								<div
									className="bg-cover rounded-3 mb-2  h-20rem"
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

export default Collage;
